import ConnectionLoader from '../ConnectionLoader';
import TaskGroup from '../entities/TaskGroup';

export default ({ queue }) => {
  const taskGroup = new ConnectionLoader(async ({ taskGroupId, options }) => {
    const taskGroup = await queue.listTaskGroup(taskGroupId, options);

    return new TaskGroup(taskGroupId, taskGroup);
  });

  return {
    taskGroup,
  };
};
