import DataLoader from 'dataloader';
import sift from 'sift';
import fetch from '../utils/fetch';
import ConnectionLoader from '../ConnectionLoader';
import Task from '../entities/Task';

export default ({ queue, index }) => {
  const task = new DataLoader(taskIds =>
    Promise.all(
      taskIds.map(async taskId => {
        const task = await queue.task(taskId);

        return new Task(taskId, null, task);
      })
    )
  );
  const indexedTask = new DataLoader(indexPaths =>
    Promise.all(indexPaths.map(indexPath => index.findTask(indexPath)))
  );
  const taskGroup = new ConnectionLoader(
    async ({ taskGroupId, options, filter }) => {
      const raw = await queue.listTaskGroup(taskGroupId, options);
      const tasks = filter ? sift(filter, raw.tasks) : raw.tasks;

      return {
        ...raw,
        items: tasks.map(
          ({ task, status }) => new Task(status.taskId, status, task)
        ),
      };
    }
  );
  const taskActions = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ taskGroupId, filter }) => {
        const url = await queue.buildUrl(
          queue.getLatestArtifact,
          taskGroupId,
          'public/actions.json'
        );

        try {
          const raw = await fetch(url);

          return raw.actions
            ? {
                ...raw,
                actions: filter ? sift(filter, raw.actions) : raw.actions,
              }
            : null;
        } catch (e) {
          if (e.response.status === 404 || e.response.status === 424) {
            return null;
          }

          return e;
        }
      })
    )
  );

  return {
    task,
    indexedTask,
    taskGroup,
    taskActions,
  };
};
