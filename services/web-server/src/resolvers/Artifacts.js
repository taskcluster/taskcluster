export default {
  Query: {
    artifacts(parent, args, { loaders }) {
      return loaders.artifacts.load(args);
    },
    latestArtifacts(parent, args, { loaders }) {
      return loaders.latestArtifacts.load(args);
    },
  },
};
