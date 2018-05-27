import { TextDocument, WorkspaceConfiguration, Uri } from "vscode";

export interface ActivationManagerDelegate {
	getDocuments(): TextDocument[];
	getConfiguration(section?: string, resource?: Uri | null): WorkspaceConfiguration;
	activate(): void;
	deactivate(): void;
}

const defaultLanguages = ['javascript', 'javascriptreact'];

export default class ActivationManager {
	private isActivated = false;

	constructor(private delegate: ActivationManagerDelegate) {}

	public activate() {
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

	private activateIfNeeded(docs: TextDocument[]) {
		if (this.isActivated) {
			return;
		}
		for (const doc of docs) {
			if (this.shouldBeValidated(doc)) {
				this.isActivated = true;
				this.delegate.activate();
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
