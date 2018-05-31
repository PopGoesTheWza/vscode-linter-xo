# linter-xo-2

> Linter for [XO](https://github.com/sindresorhus/xo)

This is originally fork of [linter-xo](https://github.com/SamVerschueren/vscode-linter-xo) but I have rewrite almost everything.

## Usage

This extension requires XO to be install [XO](https://github.com/sindresorhus/xo) to be installed as a dependency or dev dependency.

```
$ npm install --save-dev xo
```

In Visual Studio Code, press <kbd>F1</kbd> and narrow down the list of commands by typing `extension`. Pick `Extensions: Install Extension`.

![](https://github.com/xlc/vscode-linter-xo/raw/master/media/screenshot.png)

Simply search for the `linter-xo-2` extension from the list and install it.

## Fix issues

Press `F1` and choose `XO: Fix all auto-fixable problems`

![](https://github.com/xlc/vscode-linter-xo/raw/master/xo/media/fix.gif)

> Tip: Bind a keyboard shortcut to `xo.fix`


## Settings Options

This extension contributes the following variables to the settings:

- `xo.enable`: Enable/Disable XO. It is enabled by default.
- `xo.options`: Extra options that will be passed to XO. Default to empty object. An example to disable semi colon is:

```json
{
  "xo.options": {
    "semicolon": false
  }
}
```
- `xo.validate`: An array of language identifiers specify the files to be validated. It defaults to `["javascript", "javascriptreact"]`
	- To enable XO for TypeScript use `"[ "javascript", "javascriptreact", "typescript", "typescriptreact" ]`
	- To enable XO for Vue.js use `[ "javascript", "javascriptreact", "vue" ]`
- `xo.format.enable`: Enable/Disable XO formatter integration which uses `xo --fix` as formatter. Requires `xo.enable` to be true. It is disabled by default.

## TODOs

- New Code Action: Disable rule on this line
- Run auto fix multiple times until all issus are fixed

## License

[MIT](https://github.com/xlc/vscode-linter-xo/blob/master/license)
