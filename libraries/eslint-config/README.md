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

You can then either have a script target in your `package.json` that
calls eslint directly or use [mocha-eslint](https://www.npmjs.com/package/mocha-eslint)
to automatically lint on test runs.
