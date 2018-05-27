
export class Package {

	constructor(
		private workspaceRoot: string
	) { }

	isDependency(name: string) {
		// try {
		// 	const pkg = loadJsonFile.sync(path.join(this.workspaceRoot, 'package.json'));
		// 	const deps = pkg.dependencies || {};
		// 	const devDeps = pkg.devDependencies || {};

		// 	return Boolean(deps[name] || devDeps[name]);
		// } catch (err) {
		// 	if (err.code === 'ENOENT') {
		// 		return false
		// 	}

		// 	throw err;
		// }
		console.log(name, this.workspaceRoot);
		return false;
	}
}
