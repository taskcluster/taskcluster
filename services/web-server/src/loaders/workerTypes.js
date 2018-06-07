import DataLoader from 'dataloader';
import sift from 'sift';
import ConnectionLoader from '../ConnectionLoader';

export default ({ queue, awsProvisioner, ec2Manager }) => {
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
      const workerTypes = filter
        ? sift(filter, raw.workerTypes)
        : raw.workerTypes;

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

        return filter ? sift(filter, summaries) : summaries;
      })
    )
  );
  const awsProvisionerRecentErrors = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ filter }) => {
        const recentErrors = (await ec2Manager.getRecentErrors()).errors;

        return filter ? sift(filter, recentErrors) : recentErrors;
      })
    )
  );
  const awsProvisionerHealth = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ filter }) => {
        const health = await ec2Manager.getHealth();

        return filter ? sift(filter, health) : health;
      })
    )
  );

  return {
    workerType,
    workerTypes,
    pendingTasks,
    awsProvisionerRecentErrors,
    awsProvisionerHealth,
    awsProvisionerWorkerType,
    awsProvisionerWorkerTypeState,
    awsProvisionerWorkerTypeSummaries,
  };
};
