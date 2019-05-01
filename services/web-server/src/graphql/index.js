const requireContext = require('../utils/requireContext');

const importer = requireContext('./', true, /\.graphql$/);
const keys = [
  ...new Set([
    'Root.graphql',
    ...importer.keys(),
  ]),
];

module.exports = [
  ...keys.reduce((typeDefs, key) => typeDefs.add(importer(key)), new Set()),
].join('\n');
