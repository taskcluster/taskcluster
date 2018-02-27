const merge = require('deepmerge');

// eslint-disable-next-line padding-line-between-statements
const importer = require.context('./', true, /\.js/);
const keys = [
  ...new Set([
    './Root.js',
    ...importer.keys().filter(key => key !== './index.js'),
  ]),
];

module.exports = keys.reduce(
  (resolvers, key) => merge(resolvers, importer(key).default),
  {}
);
