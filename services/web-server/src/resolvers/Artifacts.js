export default {
  ArtifactStorageType: {
    BLOB: 'blob',
    S3: 's3',
    AZURE: 'azure',
    REFERENCE: 'reference',
    ERROR: 'error',
  },
  Query: {
    artifact(parent, args, { loaders }) {
      return loaders.artifact.load(args);
    },
    artifacts(parent, { taskId, runId, connection, filter }, { loaders }) {
      return loaders.artifacts.load({ taskId, runId, connection, filter });
    },
    latestArtifacts(parent, { taskId, connection, filter }, { loaders }) {
      return loaders.latestArtifacts.load({ taskId, connection, filter });
    },
  },
};
