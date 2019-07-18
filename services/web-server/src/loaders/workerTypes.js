const DataLoader = require('dataloader');
const siftUtil = require('../utils/siftUtil');
const ConnectionLoader = require('../ConnectionLoader');

module.exports = ({ queue, awsProvisioner, ec2Manager }) => {
  const workerType = new DataLoader(queries =>
    Promise.all(
      queries.map(({ provisionerId, workerType }) =>
        queue.getWorkerType(provisionerId, workerType)
      )
    )
  );
  const workerTypes = new ConnectionLoader(
    async ({ provisionerId, options, filter }) => {
      const raw = await queue.listWorkerTypes(provisionerId, options);
      const workerTypes = siftUtil(filter, raw.workerTypes);
      return { ...raw, items: workerTypes };
    }
  );
  const pendingTasks = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ provisionerId, workerType }) => {
        const { pendingTasks } = await queue.pendingTasks(
          provisionerId,
          workerType
        );

        return pendingTasks;
      })
    )
  );
  const awsProvisionerWorkerType = new DataLoader(workerTypes =>
    Promise.all(
      workerTypes.map(workerType => awsProvisioner.workerType(workerType))
    )
  );
  const awsProvisionerWorkerTypeState = new DataLoader(workerTypes =>
    Promise.all(workerTypes.map(workerType => awsProvisioner.state(workerType)))
  );
  const awsProvisionerWorkerTypeSummaries = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ filter }) => {
        const summaries = await awsProvisioner.listWorkerTypeSummaries();

        return siftUtil(filter, summaries);
      })
    )
  );
  const awsProvisionerRecentErrors = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ filter }) => {
        const recentErrors = (await ec2Manager.getRecentErrors()).errors;

        return siftUtil(filter, recentErrors);
      })
    )
  );
  const awsProvisionerHealth = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ filter }) => {
        const health = await ec2Manager.getHealth();

        return siftUtil(filter, health);
      })
    )
  );
  const awsProvisionerWorkerTypeHealth = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ workerType, filter }) => {
        const health = await ec2Manager.workerTypeHealth(workerType);

        return siftUtil(filter, health);
      })
    )
  );
  const awsProvisionerWorkerTypeErrors = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ workerType, filter }) => {
        const { errors } = await ec2Manager.workerTypeErrors(workerType);

        return siftUtil(filter, errors);
      })
    )
  );

  return {
    workerType,
    workerTypes,
    pendingTasks,
    awsProvisionerRecentErrors,
    awsProvisionerHealth,
    awsProvisionerWorkerTypeErrors,
    awsProvisionerWorkerTypeHealth,
    awsProvisionerWorkerType,
    awsProvisionerWorkerTypeState,
    awsProvisionerWorkerTypeSummaries,
  };
};
