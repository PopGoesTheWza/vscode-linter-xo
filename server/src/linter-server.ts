import {
	IConnection, TextDocumentSyncKind,
	DidChangeConfigurationNotification, DidChangeWorkspaceFoldersNotification,
	TextDocuments, NotificationType, TextDocument, Files, DidChangeWatchedFilesNotification, Diagnostic,
	VersionedTextDocumentIdentifier, TextEdit, Range, ExecuteCommandRequest, CodeActionRequest, WorkspaceChange, Command,
	DocumentFormattingRequest, DidOpenTextDocumentNotification, DidChangeTextDocumentNotification, BulkRegistration,
	DidCloseTextDocumentNotification, DidSaveTextDocumentNotification, CodeActionParams
} from 'vscode-languageserver';
import URI from 'vscode-uri';

import BufferedMessageQueue from './buffered-message-queue';
import { findPackageJson, loadJson, makeDiagnostic, computeKey } from './utils';
import { dirname } from 'path';
import Fixes, { ESLintProblem, AutoFix } from './fixes';

const enum CommandIds {
	applySingleFix = 'xo.applySingleFix',
	applySameFixes = 'xo.applySameFixes',
	applyAllFixes = 'xo.applyAllFixes',
	applyAutoFix = 'xo.applyAutoFix',
	disableRuleThisLine = 'xo.disableRuleThisLine'
}

namespace Notifications {
	export const validate = new NotificationType<TextDocument, void>('xo/validate')
};

interface XOModule {
	lintText: (content: string, options: any) => any
}

interface TextDocumentSettings {
	enable: boolean;
	validate: string[];
	options: any | undefined;
	workspaceRoot: string;
	library: XOModule | undefined;
	format: {
		enable: boolean
	} | undefined
}

export default class LinterServer {
	private messageQueue: BufferedMessageQueue;

	private documents = new TextDocuments();
	private documentSettings = new Map<string, Thenable<TextDocumentSettings>>();
	private cachedModules = new Map<string, XOModule>();
	private codeActions = new Map<string, Map<string, AutoFix>>();
	private codeActionCommands = new Map<string, WorkspaceChange>();

	constructor(private connection: IConnection) {
		this.messageQueue = new BufferedMessageQueue(this.connection);

		this.documents.listen(this.connection);

		this.documents.onDidChangeContent(event => {
			this.messageQueue.addNotificationMessage(Notifications.validate, event.document, event.document.version);
		});

		this.documents.onDidClose(event => {
			this.resolveSettings(event.document).then(settings => {
				let uri = event.document.uri;
				this.documentSettings.delete(uri);
				this.codeActions.delete(uri);
				if (settings.enable) {
					// Clear the diagnostics when document is closed
					this.connection.sendDiagnostics({ uri, diagnostics: [] })
				}
			});
		})

		this.connection.onInitialize(() => {
			return {
				capabilities: {
					textDocumentSync: {
						change: TextDocumentSyncKind.Full
					},
					codeActionProvider: true,
					documentFormattingProvider: true,
					executeCommandProvider: {
						commands: [
							CommandIds.applySingleFix,
							CommandIds.applySameFixes,
							CommandIds.applyAllFixes,
							CommandIds.applyAutoFix,
							CommandIds.disableRuleThisLine
						]
					}
				}
			};
		});

		this.connection.onInitialized(() => {
			const registration = BulkRegistration.create();
			registration.add(DidChangeConfigurationNotification.type, null);
			registration.add(DidChangeWorkspaceFoldersNotification.type, null);
			registration.add(DidOpenTextDocumentNotification.type, null);
			registration.add(DidChangeTextDocumentNotification.type, null);
			registration.add(DidCloseTextDocumentNotification.type, null);
			registration.add(DidSaveTextDocumentNotification.type, null);
			connection.client.register(registration);
		})

		this.messageQueue.registerNotification(DidChangeConfigurationNotification.type, () => {
			this.updateDocumentSettings();
		});

		this.messageQueue.registerNotification(DidChangeWorkspaceFoldersNotification.type, () => {
			this.updateDocumentSettings();
		});

		this.messageQueue.registerNotification(DidChangeWatchedFilesNotification.type, params => {
			// package.json changed
			this.validateMany(this.documents.all());
		});

		this.messageQueue.onNotification(Notifications.validate, doc => {
			this.validateSingle(doc);
		}, doc => doc.version);

		this.messageQueue.registerRequest(CodeActionRequest.type, params => {
			this.codeActionCommands.clear();
			const result = this.computeFixCommands(params);
			return result.concat(this.computeDisableRuleCommands(params));
		});

		this.messageQueue.registerRequest(ExecuteCommandRequest.type, params => {
			let workspaceChange: WorkspaceChange | undefined;
			if (params.command === CommandIds.applyAutoFix) {
				if (params.arguments) {
					let identifier: VersionedTextDocumentIdentifier = params.arguments[0];
					let edits = this.computeAllFixes(identifier);
					if (edits) {
						workspaceChange = new WorkspaceChange();
						let textChange = workspaceChange.getTextEditChange(identifier);
						edits.forEach(edit => textChange.add(edit));
					}
				}
			} else if (params.command === CommandIds.disableRuleThisLine) {
				if (params.arguments) {
					workspaceChange = new WorkspaceChange();
					const uri = params.arguments[0];
					const diagnostic: Diagnostic = params.arguments[1];
					const textChange = workspaceChange.getTextEditChange(uri);
					const endPos = diagnostic.range.end;
					endPos.line += 1;
					endPos.character = 0;
					const doc = this.documents.get(uri);
					if (doc) {
						const offset = doc.offsetAt(endPos) - 1;
						textChange.add(TextEdit.insert(doc.positionAt(offset), ` // eslint-disable-line ${diagnostic.code}`));
					}
				}
			} else {
				workspaceChange = this.codeActionCommands.get(params.command);
			}

			if (!workspaceChange) {
				return {};
			}
			return this.connection.workspace.applyEdit(workspaceChange.edit).then((response) => {
				if (!response.applied) {
					this.error(`Failed to apply command: ${params.command}`);
				}
				return {};
			}, () => {
				this.error(`Failed to apply command: ${params.command}`);
			});
		}, (params): number => {
			if (params.command === CommandIds.applyAutoFix) {
				return params.arguments && params.arguments[0].version;
			} else {
				return 0;
			}
		});

		this.messageQueue.registerRequest(DocumentFormattingRequest.type, params => {
			const doc = this.documents.get(params.textDocument.uri);
			if (!doc) {
				return null;
			}
			return this.resolveSettings(doc).then(settings => {
				if (!settings.enable || !settings.format || !settings.format.enable) {
					return null;
				}
				let textDocument: VersionedTextDocumentIdentifier = {
					uri: params.textDocument.uri,
					version: doc.version
				  };
				  return this.computeAllFixes(textDocument);
			});
		});
	}

	private updateDocumentSettings() {
		this.documentSettings.clear();
		this.log('clear document settings');
		this.validateMany(this.documents.all());
	}

	private resolveSettings(doc: TextDocument): Thenable<TextDocumentSettings> {
		let promise = this.documentSettings.get(doc.uri);
		if (!promise) {
			promise = this.connection.workspace.getConfiguration({ scopeUri: doc.uri, section: 'xo'})
			.then((settings: TextDocumentSettings) => {
				if (!settings.enable) {
					return settings;
				}
				let valid = false;
				for (const item of settings.validate) {
					if (item === doc.languageId) {
						valid = true;
						break;
					}
				}
				if (!valid) {
					settings.enable = false;
					return settings;
				}
				const uri = URI.parse(doc.uri);
				const tracer = this.trace.bind(this);
				return this.connection.workspace.getWorkspaceFolders()
				.then(folders => {
					if (folders) {
						return folders.map(folder => URI.parse(folder.uri).fsPath)
					}
					return []
				})
				.then(folderPaths => findPackageJson(uri.fsPath, folderPaths))
				.then(packageJsonPath => {
					if (packageJsonPath === null) {
						this.error('Unable to locate package.json file for document: ' + doc.uri);
						settings.enable = false
						return settings;
					}
					const packageObject = loadJson(packageJsonPath);
					if (!packageObject) {
						this.error('Unable to read package.json file for document: ' + doc.uri);
						settings.enable = false
						return settings;
					}
					const deps = packageObject.dependencies || {};
					const devDeps = packageObject.devDependencies || {};
					const hasXO = Boolean(deps.xo) || Boolean(devDeps.xo) || Boolean(packageObject.xo);
					if (!hasXO) {
						this.info('XO is not enabled for document: ' + doc.uri);
						settings.enable = false
						return settings;
					}
					settings.workspaceRoot = dirname(packageJsonPath);
					const dir = dirname(uri.fsPath);
					process.chdir(settings.workspaceRoot);
					return Files.resolve('xo', dirname(packageJsonPath), dir, tracer).then(path => {
						let lib = this.cachedModules.get(path);
						if (!lib) {
							lib = require(path);
							if (!lib || !lib.lintText) {
								settings.enable = false;
								this.error(`The XO library doesn't export a lintText method. Path: ${path}`);
								return settings;
							} else {
								this.log(`XO library loaded. Path: ${path}`);
								settings.library = lib;
							}
							this.cachedModules.set(path, lib);
						}
						settings.library = lib;
						return settings;
					});
				});
			});
			this.documentSettings.set(doc.uri, promise);
		}
		return promise;
	}

	private validateMany(docs: TextDocument[]) {
		for (const doc of docs) {
			this.messageQueue.addNotificationMessage(Notifications.validate, doc, doc.version);
		}
	}

	private validateSingle(doc: TextDocument) {
		// We validate document in a queue but open / close documents directly.
		// So we need to deal with the fact that a document might be gone from the server.
		if (!this.documents.get(doc.uri)) {
			return Promise.resolve();
		}
		return this.resolveSettings(doc).then(settings => {
			if (!settings.enable) {
				return;
			}
			try {
				this.validate(doc, settings);
			} catch (err) {
				this.connection.window.showErrorMessage(`XO: ${err}`)
			}
		});
	}

	private validate(doc: TextDocument, settings: TextDocumentSettings) {
		const uri = URI.parse(doc.uri);
		const fsPath = uri.fsPath;
		const contents = doc.getText();

		if (fsPath === null) {
			return;
		}

		const options: any = settings.options;
		options.cwd = settings.workspaceRoot;
		options.filename = fsPath

		const report = settings.library!.lintText(contents, options);

		// Clean previously computed code actions.
		this.codeActions.delete(doc.uri);

		const diagnostics: Diagnostic[] = this.makeDiagnostics(doc, report);

		this.connection.sendDiagnostics({ uri: doc.uri, diagnostics });
	}

	private makeDiagnostics(doc: TextDocument, report: any) {
		const result = report && report.results && report.results[0];
		const messages = result && result.messages;
		if (!messages) {
			return [];
		}
		return messages.map((problem: any) => {
			const diagnostic = makeDiagnostic(problem);
			this.recordCodeAction(doc, diagnostic, problem);
			return diagnostic;
		});
	}

	private recordCodeAction(document: TextDocument, diagnostic: Diagnostic, problem: ESLintProblem): void {
		if (!problem.fix || !problem.ruleId) {
			return;
		}

		const uri = document.uri;
		let edits = this.codeActions.get(uri);
		if (!edits) {
			edits = new Map();
			this.codeActions.set(uri, edits);
		}

		edits.set(computeKey(diagnostic), {
			label: `Fix this ${problem.ruleId} problem`,
			documentVersion: document.version,
			ruleId: problem.ruleId,
			edit: problem.fix
		});
	}

	private computeAllFixes(identifier: VersionedTextDocumentIdentifier): TextEdit[] {
		let uri = identifier.uri;
		let textDocument = this.documents.get(uri);
		if (!textDocument || identifier.version !== textDocument.version) {
			return [];
		}
		let doc = textDocument;
		let edits = this.codeActions.get(uri);

		if (edits) {
			let fixes = new Fixes(edits);
			if (!fixes.isEmpty()) {
				return fixes.getOverlapFree().map((editInfo: AutoFix) => {
					const range = Range.create(doc.positionAt(editInfo.edit.range[0]), doc.positionAt(editInfo.edit.range[1]));
					return TextEdit.replace(range, editInfo.edit.text || '');
				});
			}
		}
		return [];
	}

	private computeFixCommands(params: CodeActionParams): Command[] {
		const result: Command[] = [];
		const uri = params.textDocument.uri;
		const edits = this.codeActions.get(uri);
		if (!edits) {
			return result;
		}

		const fixes = new Fixes(edits);
		if (fixes.isEmpty()) {
			return result;
		}

		const textDocument = this.documents.get(uri);
		let documentVersion: number = -1;
		let ruleId: string = '';

		if (!textDocument) {
			return result;
		}

		const doc = textDocument;

		function createTextEdit(editInfo: AutoFix): TextEdit {
			return TextEdit.replace(Range.create(doc.positionAt(editInfo.edit.range[0]), doc.positionAt(editInfo.edit.range[1])), editInfo.edit.text || '');
		}

		function getLastEdit(array: AutoFix[]): AutoFix | undefined {
			let length = array.length;
			if (length === 0) {
				return undefined;
			}
			return array[length - 1];
		}

		for (let editInfo of fixes.getScoped(params.context.diagnostics)) {
			documentVersion = editInfo.documentVersion;
			ruleId = editInfo.ruleId;
			let workspaceChange = new WorkspaceChange();
			workspaceChange.getTextEditChange({uri, version: documentVersion}).add(createTextEdit(editInfo));
			this.codeActionCommands.set(CommandIds.applySingleFix, workspaceChange);
			result.push(Command.create(editInfo.label, CommandIds.applySingleFix));
		};

		if (result.length > 0) {
			let same: AutoFix[] = [];
			let all: AutoFix[] = [];


			for (let editInfo of fixes.getAllSorted()) {
				if (documentVersion === -1) {
					documentVersion = editInfo.documentVersion;
				}
				if (editInfo.ruleId === ruleId && !Fixes.overlaps(getLastEdit(same), editInfo)) {
					same.push(editInfo);
				}
				if (!Fixes.overlaps(getLastEdit(all), editInfo)) {
					all.push(editInfo);
				}
			}
			if (same.length > 1) {
				let sameFixes: WorkspaceChange = new WorkspaceChange();
				let sameTextChange = sameFixes.getTextEditChange({uri, version: documentVersion});
				same.map(createTextEdit).forEach(edit => sameTextChange.add(edit));
				this.codeActionCommands.set(CommandIds.applySameFixes, sameFixes);
				result.push(Command.create(`Fix all ${ruleId} problems`, CommandIds.applySameFixes));
			}
			if (all.length > 1) {
				let allFixes: WorkspaceChange = new WorkspaceChange();
				let allTextChange = allFixes.getTextEditChange({uri, version: documentVersion});
				all.map(createTextEdit).forEach(edit => allTextChange.add(edit));
				this.codeActionCommands.set(CommandIds.applyAllFixes, allFixes);
				result.push(Command.create(`Fix all auto-fixable problems`, CommandIds.applyAllFixes));
			}
		}
		return result;
	}

	private computeDisableRuleCommands(params: CodeActionParams): Command[] {
		const result: Command[] = [];
		const uri = params.textDocument.uri;

		for (const diagnostic of params.context.diagnostics) {
			if (diagnostic.code) {
				result.push(Command.create(`Disable rule ${diagnostic.code} on this line`, CommandIds.disableRuleThisLine, uri, diagnostic));
			}
		}
		return result;
	}

	private trace(message: string, verbose?: string): void {
		this.connection.tracer.log(message, verbose);
	}

	private error(...messages: string[]) {
		this.connection.console.error(messages.join(', '));
	}

	private info(...messages: string[]) {
		this.connection.console.info(messages.join(', '));
	}

	private log(...messages: string[]) {
		this.connection.console.log(messages.join(', '));
	}
}
