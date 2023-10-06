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
