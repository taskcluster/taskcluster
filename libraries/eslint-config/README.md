# Taskcluster's ESLint configuration

## Install

```sh
npm install --save-dev eslint-config-taskcluster eslint-plugin-taskcluster
```

Both the plugin and config need to be installed in the project as explained in [this discussion](https://github.com/eslint/eslint/pull/4735).

## Use

In your project's `.eslintrc`, use the `extends` feature:

```js
{
  'extends': 'eslint-config-taskcluster'
}
```

You can then either have a script target in your `package.json` that
calls eslint directly or use [mocha-eslint](https://www.npmjs.com/package/mocha-eslint)
to automatically lint on test runs.
