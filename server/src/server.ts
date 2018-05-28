import { createConnection } from 'vscode-languageserver';
import LinterServer from './linter-server';

const connection = createConnection();

new LinterServer(connection);

connection.listen()
