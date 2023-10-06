import requireContext from '../utils/requireContext';

const importer = requireContext('./', true, /\.graphql$/);
const keys = [
  ...new Set([
    'Root.graphql',
    ...importer.keys(),
  ]),
];

export default [
  ...keys.reduce((typeDefs, key) => typeDefs.add(importer(key)), new Set()),
].join('\n');
