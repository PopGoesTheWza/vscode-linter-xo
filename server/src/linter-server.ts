import {
	IConnection, TextDocumentSyncKind,
	DidChangeConfigurationNotification, DidChangeWorkspaceFoldersNotification, WorkspaceFolder, TextDocuments, NotificationType, TextDocument
} from 'vscode-languageserver';
import BufferedMessageQueue from './buffered-message-queue';

const enum CommandIds {
	applySingleFix = 'xo.applySingleFix',
	applySameFixes = 'xo.applySameFixes'
}

namespace Notifications {
	export const validate = new NotificationType<TextDocument, void>('xo/validate')
};

interface XOModule {

}

interface TextDocumentSettings {
	validate: boolean;
	options: any | undefined;
	library: XOModule | undefined;
}

export default class LinterServer {
	private messageQueue: BufferedMessageQueue;

	private documents = new TextDocuments();
	private documentSettings: Map<string, Thenable<TextDocumentSettings>> = new Map<string, Thenable<TextDocumentSettings>>();

	constructor(private connection: IConnection) {
		this.messageQueue = new BufferedMessageQueue(this.connection);

		this.documents.listen(this.connection);

		this.connection.onInitialize(() => {
			return {
				capabilities: {
					textDocumentSync: {
						change: TextDocumentSyncKind.Full
					},
					codeActionProvider: true,
					executeCommandProvider: {
						commands: [CommandIds.applySingleFix, CommandIds.applySameFixes]
					}
				}
			};
		});

		this.connection.onInitialized(() => {
			connection.client.register(DidChangeConfigurationNotification.type, undefined);
			connection.client.register(DidChangeWorkspaceFoldersNotification.type, undefined);
		})

		this.messageQueue.registerNotification(DidChangeConfigurationNotification.type, () => {
			this.updateDocumentSettings();
		});

		this.messageQueue.registerNotification(DidChangeWorkspaceFoldersNotification.type, () => {
			this.updateDocumentSettings();
		});
	}

	private updateDocumentSettings() {
		this.documentSettings.clear();

		for (const doc of this.documents.all()) {
			this.messageQueue.addNotificationMessage(Notifications.validate, doc, doc.version);
		}
	}

	private resolveSettings(doc: TextDocument): Thenable<TextDocumentSettings> {
		const uri = doc.uri;
		let promise = this.documentSettings.get(uri);
		if (!promise) {
			promise = this.connection.workspace.getConfiguration({ scopeUri: uri, section: 'xo'}).then((settings: TextDocumentSettings) => {
				return settings;
			});
			this.documentSettings.set(uri, promise);
		}
		return promise;
	}
}
