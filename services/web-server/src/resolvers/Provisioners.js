export default {
  ProvisionerStability: {
    EXPERIMENTAL: 'experimental',
    STABLE: 'stable',
    DEPRECATED: 'deprecated',
  },
  Provisioner: {
    workerTypes({ provisionerId }, { connection }, { loaders }) {
      return loaders.workerTypes.load({ provisionerId, connection });
    },
    workerType({ provisionerId }, { workerType }, { loaders }) {
      return loaders.workerType.load({ provisionerId, workerType });
    },
  },
  Query: {
    provisioner(_parent, { provisionerId }, { loaders }) {
      return loaders.provisioner.load(provisionerId);
    },
    provisioners(_parent, { connection }, { loaders }) {
      return loaders.provisioners.load({ connection });
    },
  },
};
