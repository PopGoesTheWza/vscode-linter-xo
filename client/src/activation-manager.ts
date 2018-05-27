import { TextDocument, WorkspaceConfiguration, Uri, ExtensionContext } from "vscode";

export interface ActivationManagerDelegate {
	getDocuments(): TextDocument[];
	getConfiguration(section?: string, resource?: Uri | null): WorkspaceConfiguration;
	activate(context: ExtensionContext): void;
	deactivate(): void;
	handleCommand(command: string): void;
	showInformationMessage(message: string): void;
}

const defaultLanguages = ['javascript', 'javascriptreact'];

export default class ActivationManager {
	private isActivated = false;
	private context: ExtensionContext | undefined;

	constructor(private delegate: ActivationManagerDelegate) {}

	public activate(context: ExtensionContext) {
		this.context = context;
		this.didChangeConfiguration();
	}

	public deactivate() {
		if (this.isActivated) {
			this.deactivate();
			this.isActivated = false;
		}
	}

	public didOpenTextDocument(doc: TextDocument) {
		this.activateIfNeeded([doc]);
	}

	public didChangeConfiguration() {
		this.activateIfNeeded(this.delegate.getDocuments());
	}

	public createCommandHandler(command: string): () => void {
		return () => {
			if (this.isActivated) {
				this.delegate.handleCommand(command)
			} else {
				this.delegate.showInformationMessage('XO is not validating any files yet.')
			}
		};
	}

	private activateIfNeeded(docs: TextDocument[]) {
		if (this.isActivated) {
			return;
		}
		for (const doc of docs) {
			if (this.shouldBeValidated(doc)) {
				this.isActivated = true;
				this.delegate.activate(this.context!);
				return;
			}
		}
	}

	private shouldBeValidated(doc: TextDocument): boolean {
		const config = this.delegate.getConfiguration('xo', doc.uri);
		if (!config.get('enable', true)) {
			return false;
		}
		let validate = config.get<string[]>('validate', defaultLanguages);
		for (let item of validate) {
			if (item === doc.languageId) {
				return true;
			}
		}
		return false;
	}
}
