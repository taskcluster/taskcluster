export default {
  ArtifactStorageType: {
    BLOB: 'blob',
    S3: 's3',
    AZURE: 'azure',
    REFERENCE: 'reference',
    ERROR: 'error',
  },
  Query: {
    artifacts(parent, { taskId, runId, connection }, { loaders }) {
      return loaders.artifacts.load({ taskId, runId, connection });
    },
    latestArtifacts(parent, { taskId, connection }, { loaders }) {
      return loaders.latestArtifacts.load({ taskId, connection });
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
