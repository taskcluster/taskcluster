// eslint-disable-next-line padding-line-between-statements
const importer = require.context('./', true, /\.js/);
const keys = [
  ...new Set([...importer.keys().filter(key => key !== './index.js')]),
];
const loaders = keys.map(key => importer(key).default);

module.exports = (clients, isAuthed) =>
  loaders.reduce(
    (loaders, loader) => ({ ...loaders, ...loader(clients, isAuthed) }),
    {}
  );
