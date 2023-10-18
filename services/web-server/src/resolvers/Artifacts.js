export default {
  ArtifactStorageType: {
    BLOB: 'blob',
    S3: 's3',
    AZURE: 'azure',
    REFERENCE: 'reference',
    ERROR: 'error',
  },
  Query: {
    artifacts(parent, { taskId, runId, connection, filter }, { loaders }) {
      return loaders.artifacts.load({ taskId, runId, connection, filter });
    },
    latestArtifacts(parent, { taskId, connection, filter }, { loaders }) {
      return loaders.latestArtifacts.load({ taskId, connection, filter });
    },
  },
  Subscription: {
    artifactsCreated: {
      subscribe(parent, { taskGroupId }, { clients, pulseEngine }) {
        const routingKey = { taskGroupId };
        const binding = clients.queueEvents.artifactCreated(routingKey);

        return pulseEngine.eventIterator('artifactsCreated', {
          [binding.routingKeyPattern]: [binding.exchange],
        });
      },
    },
  },
};
