import merge from 'deepmerge';
import requireContext from '../utils/requireContext';

// eslint-disable-next-line padding-line-between-statements
const importer = requireContext('./', true, /\.js/);
const keys = [
  ...new Set([
    'Root.js',
    ...importer.keys().filter(key => key !== 'index.js'),
  ]),
];

export default keys.reduce(
  (resolvers, key) => merge(resolvers, importer(key)),
  {},
);
