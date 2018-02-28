export default {
  Query: {
    artifacts(parent, { taskId, runId, connection, filter }, { loaders }) {
      return loaders.artifacts.load({ taskId, runId, connection, filter });
    },
    latestArtifacts(parent, { taskId, connection, filter }, { loaders }) {
      return loaders.latestArtifacts.load({ taskId, connection, filter });
    },
  },
};
