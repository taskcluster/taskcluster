const requireContext = require('../utils/requireContext');
const path = require('path');

// eslint-disable-next-line padding-line-between-statements
const importer = requireContext('./', true, /\.js/);
const indexFile = path.resolve(__dirname, 'index.js');
const keys = [
  ...new Set([...importer.keys().filter(key => key !== indexFile)]),
];
const loaders = keys.map(key => importer(key));

module.exports = (clients, isAuthed, rootUrl, strategies, req, cfg) =>
  loaders.reduce(
    (loaders, loader) => ({
      ...loaders,
      ...loader(clients, isAuthed, rootUrl, strategies, req, cfg),
    }),
    {}
  );
