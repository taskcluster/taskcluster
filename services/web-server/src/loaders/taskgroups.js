import DataLoader from 'dataloader';
import TaskGroup from '../entities/TaskGroup';

export default ({ queue }) => {
  const taskGroup = new DataLoader(connections =>
    Promise.all(
      connections.map(async ({ taskGroupId, connection }) => {
        const limit = connection.limit
          ? connection.limit > 100 ? 100 : connection.limit
          : 100;
        const continuationToken =
          connection.startCursor || connection.endCursor;
        const options = continuationToken
          ? { limit, continuationToken }
          : { limit };
        const taskGroup = await queue.listTaskGroup(taskGroupId, options);

        return new TaskGroup(taskGroupId, continuationToken, taskGroup);
      })
    )
  );

  return {
    taskGroup,
  };
};
