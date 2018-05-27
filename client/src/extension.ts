import { ExtensionContext, TextDocument, Uri, WorkspaceConfiguration, workspace, Disposable, commands, window } from 'vscode';
import ActivationManager from './activation-manager';
import LinterClient from './linter-client';

let openListener: Disposable | undefined;
let configurationListener: Disposable | undefined;
let linterClient: LinterClient | undefined;

const activationManager = new ActivationManager({
	getDocuments(): TextDocument[] {
		return workspace.textDocuments;
	},
	getConfiguration(section?: string, resource?: Uri | null): WorkspaceConfiguration {
		return workspace.getConfiguration(section, resource);
	},
	activate(context: ExtensionContext): void {
		if (openListener) {
			openListener.dispose();
			openListener = undefined;
		}
		if (configurationListener) {
			configurationListener.dispose();
			configurationListener = undefined;
		}
		linterClient = new LinterClient(context);
	},
	deactivate(): void {
		linterClient!.dispose();
	},
	handleCommand(command: string) {
		linterClient!.handleCommand(command);
	},
	showInformationMessage(message: string) {
		window.showInformationMessage(message)
	}
});

export function activate(context: ExtensionContext) {
	activationManager.activate(context);

	openListener = workspace.onDidOpenTextDocument(doc => {
		activationManager.didOpenTextDocument(doc);
	});
	configurationListener = workspace.onDidChangeConfiguration(_evt => {
		activationManager.didChangeConfiguration();
	});

	const registerCommand = (command: string) =>
		commands.registerCommand(command, activationManager.createCommandHandler(command));

	context.subscriptions.push(
		registerCommand('xo.fix')
	);
}

export function deactivate() {
	activationManager.deactivate();
}
