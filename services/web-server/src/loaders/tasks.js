import DataLoader from 'dataloader';
import sift from 'sift';
import request from 'superagent';
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
        const { body: actions } = await request
          .get(url)
          // retry on 5xx
          .retry(2, (err, res) => res && res.status >= 500);

        return filter ? sift(filter, actions) : actions;
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
