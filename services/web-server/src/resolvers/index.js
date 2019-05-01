const merge = require('deepmerge');
const path = require('path');
const requireContext = require('../utils/requireContext');

// eslint-disable-next-line padding-line-between-statements
const importer = requireContext('./', true, /\.js/);
const [rootFile, indexFile] = ['Root.js', `index.js`]
  .map(file => path.resolve(__dirname, file));
const keys = [
  ...new Set([
    rootFile,
    ...importer.keys().filter(key => key !== indexFile),
  ]),
];

module.exports = keys.reduce(
  (resolvers, key) => merge(resolvers, importer(key)),
  {}
);
