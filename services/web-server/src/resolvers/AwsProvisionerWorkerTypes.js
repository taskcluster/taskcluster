export default {
  /* eslint-disable camelcase */
  AwsProvisionerTerminationHealth: {
    cleanShutdown({ clean_shutdown }) {
      return clean_shutdown;
    },
    spotKill({ spot_kill }) {
      return spot_kill;
    },
    insufficientCapacity({ insufficient_capacity }) {
      return insufficient_capacity;
    },
    volumeLimitExceeded({ volume_limit_exceeded }) {
      return volume_limit_exceeded;
    },
    missingAmi({ missing_ami }) {
      return missing_ami;
    },
    startupFailed({ startup_failed }) {
      return startup_failed;
    },
    unknownCodes({ unknown_codes }) {
      return unknown_codes;
    },
    noCode({ no_code }) {
      return no_code;
    },
  },
  AwsProvisionerRequestHealth: {
    configurationIssue({ configuration_issue }) {
      return configuration_issue;
    },
    throttledCalls({ throttled_calls }) {
      return throttled_calls;
    },
    insufficientCapacity({ insufficient_capacity }) {
      return insufficient_capacity;
    },
    limitExceeded({ limit_exceeded }) {
      return limit_exceeded;
    },
  },
  /* eslint-enable camelcase */
  AwsProvisionerWorkerType: {
    state({ workerType }, args, { loaders }) {
      return loaders.awsProvisionerWorkerTypeState.load(workerType);
    },
  },
  AwsProvisionerErrorType: {
    INSTANCE_REQUEST: 'instance-request',
    TERMINATION: 'termination',
  },
  AwsProvisionerWorkerTypeSummary: {
    pendingTasks({ workerType }, args, { loaders }) {
      return loaders.pendingTasks.load({
        provisionerId: 'aws-provisioner-v1',
        workerType,
      });
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
    awsProvisionerRecentErrors(parent, { filter }, { loaders }) {
      return loaders.awsProvisionerRecentErrors.load({ filter });
    },
    awsProvisionerHealth(parent, { filter }, { loaders }) {
      return loaders.awsProvisionerHealth.load({ filter });
    },
  },
  Mutation: {
    createAwsProvisionerWorkerType(
      parent,
      { workerType, payload },
      { clients }
    ) {
      return clients.awsProvisioner.createWorkerType(workerType, payload);
    },
    updateAwsProvisionerWorkerType(
      parent,
      { workerType, payload },
      { clients }
    ) {
      return clients.awsProvisioner.updateWorkerType(workerType, payload);
    },
    async deleteAwsProvisionerWorkerType(parent, { workerType }, { clients }) {
      await clients.awsProvisioner.removeWorkerType(workerType);

      return workerType;
    },
  },
};
