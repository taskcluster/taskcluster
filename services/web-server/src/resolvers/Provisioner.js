export default {
  ProvisionerStability: {
    EXPERIMENTAL: 'experimental',
    STABLE: 'stable',
    DEPRECATED: 'deprecated',
  },
  ProvisionerActionContext: {
    PROVISIONER: 'provisioner',
    WORKER_TYPE: 'worker-type',
    WORKER: 'worker',
  },
  ProvisionerActionMethod: {
    POST: 'post',
    PUT: 'put',
    DELETE: 'delete',
    PATCH: 'patch',
  },
  Provisioner: {
    workerTypes({ provisionerId }, { connection, filter }, { loaders }) {
      return loaders.workerTypes.load({ provisionerId, connection, filter });
    },
    workerType({ provisionerId }, { workerType }, { loaders }) {
      return loaders.workerType.load({ provisionerId, workerType });
    },
  },
  Query: {
    provisioner(parent, { provisionerId }, { loaders }) {
      return loaders.provisioner.load(provisionerId);
    },
  },
};
