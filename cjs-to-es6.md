## Converting CommonJS to ES6 Modules

Steps:

- `package.json`: `"type": "module"`
- replace `"main": "index.js"` with `"exports": "index.js"`
- convert existing files (`cjs-to-es6` tool might help)
- fix imports and tests afterwards (imported files must be `.js`, i.e. `import x from './x.js'`)
- fix exports (individual `export const xx`, no more `module.exports`)
- fix broken imports
- fix tests that do import/export stuff
- json files cannot be imported?
- `__filename`, `__dirname` are not available, use `import.meta.url` instead
- set  `"sourceType": "module"` and `"ecmaVersion": "latest"` in the `parserOptions` of ESLint config.
- `jest` might fail, `NODE_OPTIONS=--experimental-vm-modules npx jest` might be needed

CommonJS vs ECMAScript modules cheatsheet: <https://tsmx.net/commonjs-vs-esm-ecmascript-cheat-sheet/>

```js
import { URL } from 'url';
const __filename = new URL('', import.meta.url).pathname;
const __dirname = new URL('.', import.meta.url).pathname;
```

## tricks

`exports.name` -> `export const name`

`import x from './x'` -> `import x from './x.js'`

Packages that don't export names directly:
`import { find } from 'lodash'` -> `import pkg from 'lodash'; const { find } = pkg;`
(or switch to es-supported modules)


## `module.parent` workarounds

no longer works with esm

```js
if (!module.parent) {
  load.crashOnError(process.argv[2]);
}
```

right way to do is:

```js
import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  load.crashOnError(process.argv[2]);
}
```
