import DataLoader from 'dataloader';
import sift from '../utils/sift.js';
import got from 'got';
import ConnectionLoader from '../ConnectionLoader.js';
import Task from '../entities/Task.js';
import maybeSignedUrl from '../utils/maybeSignedUrl.js';

export default ({ queue, index }, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId) => {
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
      const taskGroup = await queue.getTaskGroup(taskGroupId);
      const raw = await queue.listTaskGroup(taskGroupId, options);
      const tasks = sift(filter, raw.tasks);

      return {
        taskGroup,
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
          const url = await maybeSignedUrl(queue, isAuthed)(
            queue.getLatestArtifact,
            taskGroupId,
            'public/actions.json',
          );

          const raw = await got(url).json();

          return raw.actions
            ? {
              ...raw,
              actions: sift(filter, raw.actions),
            }
            : null;
        } catch (err) {
          // if the URL does not exist or is an error artifact, return nothing
          if (err.response && (err.response.statusCode === 404 || err.response.statusCode === 424)) {
            return null;
          }

          return err;
        }
      }),
    ),
  );
  const dependents = new ConnectionLoader(
    async ({ taskId, options, filter }) => {
      const raw = await queue.listDependentTasks(taskId, options);
      const tasks = sift(filter, raw.tasks);

      return {
        ...raw,
        items: tasks.map(
          ({ task, status }) => new Task(status.taskId, status, task),
        ),
      };
    },
  );

  return {
    dependents,
    task,
    indexedTask,
    taskGroup,
    taskActions,
  };
};
