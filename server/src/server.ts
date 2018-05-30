import { createConnection } from 'vscode-languageserver';
import LinterServer from './linter-server';

const connection = createConnection();

new LinterServer(connection);

process.on('uncaughtException', evt => {
	connection.console.error(evt.message);
});

connection.listen()
