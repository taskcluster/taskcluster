const requireContext = require('../utils/requireContext');
const path = require('path');

const importer = requireContext('./', true, /\.graphql$/);
const keys = [
  ...new Set([
    path.resolve(__dirname, 'Root.graphql'),
    ...importer.keys(),
  ]),
];

module.exports = [
  ...keys.reduce((typeDefs, key) => typeDefs.add(importer(key)), new Set()),
].join('\n');
