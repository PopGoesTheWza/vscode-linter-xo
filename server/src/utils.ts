import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import pathIsInside from 'path-is-inside';

function parseSeverity(severity: number): DiagnosticSeverity {
	switch (severity) {
		case 1:
			return DiagnosticSeverity.Warning;
		case 2:
			return DiagnosticSeverity.Error;
		default:
			return DiagnosticSeverity.Error;
	}
}

export function makeDiagnostic(problem: any): Diagnostic {
	const message = (problem.ruleId != null)
		? `${problem.message} (${problem.ruleId})`
		: `${problem.message}`;

	return {
		message,
		severity: parseSeverity(problem.severity),
		code: problem.ruleId,
		source: 'XO',
		range: {
			start: {line: problem.line - 1, character: problem.column - 1},
			end: {line: problem.line - 1, character: problem.column - 1}
		}
	};
}

export function computeKey(diagnostic: Diagnostic): string {
	const range = diagnostic.range;
	return `[${range.start.line},${range.start.character},${range.end.line},${range.end.character}]-${diagnostic.code}`;
}

export function findPackageJson(filePath: string, roots: string[]): string | null {
	let valid = false;
	for (const root of roots) {
		if (pathIsInside(filePath, root)) {
			valid = true;
			break;
		}
	}
	if (!valid) {
		return null;
	}
	const dir = path.dirname(filePath);
	const packageJsonPath = path.join(dir, 'package.json');
	if (existsSync(packageJsonPath)) {
		return packageJsonPath;
	}
	return findPackageJson(dir, roots);
}

export function loadJson(filePath: string): any | null {
	try {
		return JSON.parse(readFileSync(filePath, 'utf8'));
	} catch (err) {
		return null;
	}
}
