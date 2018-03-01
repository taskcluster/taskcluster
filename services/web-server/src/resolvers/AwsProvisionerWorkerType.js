export default {
  AwsProvisionerWorkerType: {
    state({ workerType }, args, { loaders }) {
      return loaders.awsProvisionerWorkerTypeState.load(workerType);
    },
  },
  Query: {
    awsProvisionerWorkerType(parent, { workerType }, { loaders }) {
      return loaders.awsProvisionerWorkerType.load(workerType);
    },
    awsProvisionerWorkerTypeState(parent, { workerType }, { loaders }) {
      return loaders.awsProvisionerWorkerTypeState.load(workerType);
    },
    awsProvisionerWorkerTypeSummaries(parent, { filter }, { loaders }) {
      return loaders.awsProvisionerWorkerTypeSummaries.load({ filter });
    },
  },
};
