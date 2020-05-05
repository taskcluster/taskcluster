const requireContext = require('../utils/requireContext');

// eslint-disable-next-line padding-line-between-statements
const importer = requireContext('./', true, /\.js/);
const keys = [
  ...new Set([...importer.keys().filter(key => key !== 'index.js')]),
];
const loaders = keys.map(key => importer(key));

module.exports = (clients, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId, traceId) =>
  loaders.reduce(
    (loaders, loader) => ({
      ...loaders,
      ...loader(clients, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId, traceId),
    }),
    {},
  );
