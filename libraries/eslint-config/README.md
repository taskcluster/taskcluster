# Taskcluster's ESLint configuration

## Install

```sh
npm install --save-dev eslint-config-taskcluster
```

## Use

In your project's `.eslintrc`, use the `extends` feature:

```js
{
  'extends': 'eslint-config-taskcluster'
}
```

Now, set up lint before testing. An example with `package.json` is:

```js
  "scripts": {
    "compile": "babel-compile -p taskcluster src:lib test:.test",
    "lint": "eslint src/*.js test/*.js",
    "pretest": "yarn lint && npm run compile",
    "test": "mocha .test/*_test.js"
  },
```

