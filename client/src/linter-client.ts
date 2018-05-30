import * as path from 'path';
import { Disposable, ExtensionContext, workspace, window } from 'vscode';
import {
	ServerOptions, TransportKind, LanguageClientOptions, RevealOutputChannelOn,
	LanguageClient, VersionedTextDocumentIdentifier, ExecuteCommandParams, ExecuteCommandRequest
} from 'vscode-languageclient';

export default class LinterClient implements Disposable {
	private client: LanguageClient;

	constructor(private context: ExtensionContext) {
		const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
		const serverOptions: ServerOptions = {
			run: {
				module: serverModule,
				transport: TransportKind.ipc,
				options: {
					cwd: process.cwd()
				}
			},
			debug: {
				module: serverModule,
				transport: TransportKind.ipc,
				options: {
					execArgv: ['--nolazy', '--inspect=6010'],
					cwd: process.cwd()
				}
			}
		};
		const clientOptions: LanguageClientOptions = {
			documentSelector: [{ scheme: 'file' }],
			diagnosticCollectionName: 'xo',
			revealOutputChannelOn: RevealOutputChannelOn.Never,
			synchronize: {
				configurationSection: 'xo',
				fileEvents: [
					workspace.createFileSystemWatcher('**/package.json')
				]
			}
		};
		this.client = new LanguageClient('XO', serverOptions, clientOptions);

		context.subscriptions.push(
			this.client.start()
		)
	}

	public handleCommand(command: string) {
		switch (command) {
			case 'xo.fix':
				this.commandFix();
				break;
		}
	}

	public dispose() {
	}

	private commandFix() {
		let textEditor = window.activeTextEditor;
		if (!textEditor) {
			return;
		}
		let textDocument: VersionedTextDocumentIdentifier = {
			uri: textEditor.document.uri.toString(),
			version: textEditor.document.version
		};
		let params: ExecuteCommandParams = {
			command: 'xo.applyAutoFix',
			arguments: [textDocument]
		}
		this.client.sendRequest(ExecuteCommandRequest.type, params).then(undefined, () => {
			window.showErrorMessage('Failed to apply XO fixes to the document. Please consider opening an issue with steps to reproduce.');
		});
	}
}
