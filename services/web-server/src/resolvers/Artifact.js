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
  },
};
