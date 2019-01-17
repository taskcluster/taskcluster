const importer = require.context('./', true, /\.graphql$/);
const keys = [...new Set(['./Root.graphql', ...importer.keys()])];

module.exports = [
  ...keys.reduce((typeDefs, key) => typeDefs.add(importer(key)), new Set()),
].join('\n');
