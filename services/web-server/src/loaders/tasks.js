const DataLoader = require('dataloader');
const sift = require('../utils/sift');
const fetch = require('../utils/fetch');
const ConnectionLoader = require('../ConnectionLoader');
const Task = require('../entities/Task');

module.exports = ({ queue, index }) => {
  const task = new DataLoader(taskIds =>
    Promise.all(
      taskIds.map(async (taskId) => {
        try {
          return new Task(taskId, null, await queue.task(taskId));
        } catch (err) {
          return err;
        }
      }),
    ),
  );
  const indexedTask = new DataLoader(indexPaths =>
    Promise.all(
      indexPaths.map(async (indexPath) => {
        try {
          return await index.findTask(indexPath);
        } catch (err) {
          return err;
        }
      }),
    ),
  );
  const taskGroup = new ConnectionLoader(
    async ({ taskGroupId, options, filter }) => {
      const raw = await queue.listTaskGroup(taskGroupId, options);
      const tasks = sift(filter, raw.tasks);

      return {
        ...raw,
        items: tasks.map(
          ({ task, status }) => new Task(status.taskId, status, task),
        ),
      };
    },
  );
  const taskActions = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ taskGroupId, filter }) => {
        try {
          const url = await queue.buildUrl(
            queue.getLatestArtifact,
            taskGroupId,
            'public/actions.json',
          );

          const raw = await fetch(url, {
            headers: {
              'x-taskcluster-skip-cache': true,
            },
          });

          return raw.actions
            ? {
              ...raw,
              actions: sift(filter, raw.actions),
            }
            : null;
        } catch (err) {
          if (err.response.status === 404 || err.response.status === 424) {
            return null;
          }

          return err;
        }
      }),
    ),
  );

  return {
    task,
    indexedTask,
    taskGroup,
    taskActions,
  };
};
