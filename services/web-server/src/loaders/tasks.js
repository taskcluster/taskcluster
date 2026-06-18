import DataLoader from 'dataloader';
import got from 'got';
import ConnectionLoader from '../ConnectionLoader.js';
import Task from '../entities/Task.js';
import maybeSignedUrl from '../utils/maybeSignedUrl.js';

// Task actions were previously filtered with a client-supplied sift query. The
// UI only ever sent two fixed shapes, encoded here as a `contextScope`:
//   - 'task'  (single-task view):  kind in {task,hook} AND context is a non-empty array
//   - 'group' (task-group view):   kind in {task,hook} AND context array has 0 or 1 entries
const TASK_ACTION_KINDS = new Set(['task', 'hook']);
const isContextSize = (context, n) => Array.isArray(context) && context.length === n;
const filterTaskActions = (actions, contextScope) =>
  actions.filter(action => {
    if (!TASK_ACTION_KINDS.has(action.kind)) {
      return false;
    }

    return contextScope === 'group'
      ? isContextSize(action.context, 0) || isContextSize(action.context, 1)
      : !isContextSize(action.context, 0);
  });

export default ({ queue, index }, isAuthed, _rootUrl, _monitor, _strategies, _req, _cfg, _requestId) => {
  const task = new DataLoader(taskIds =>
    Promise.all(
      taskIds.map(async taskId => {
        try {
          return new Task(taskId, null, await queue.task(taskId));
        } catch (err) {
          return err;
        }
      })
    )
  );
  const indexedTask = new DataLoader(indexPaths =>
    Promise.all(
      indexPaths.map(async indexPath => {
        try {
          return await index.findTask(indexPath);
        } catch (err) {
          return err;
        }
      })
    )
  );
  const taskGroup = new ConnectionLoader(async ({ taskGroupId, options }) => {
    const taskGroup = await queue.getTaskGroup(taskGroupId);
    const raw = await queue.listTaskGroup(taskGroupId, options);
    const tasks = raw.tasks;

    return {
      taskGroup,
      ...raw,
      items: tasks.map(({ task, status }) => new Task(status.taskId, status, task)),
    };
  });
  const taskActions = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ taskGroupId, contextScope }) => {
        try {
          const url = await maybeSignedUrl(queue, isAuthed)(
            queue.getLatestArtifact,
            taskGroupId,
            'public/actions.json'
          );

          const raw = await got(url).json();

          return raw.actions
            ? {
                ...raw,
                actions: filterTaskActions(raw.actions, contextScope),
              }
            : null;
        } catch (err) {
          // if the URL does not exist or is an error artifact, return nothing
          if (err.response && (err.response.statusCode === 404 || err.response.statusCode === 424)) {
            return null;
          }

          return err;
        }
      })
    )
  );
  const dependents = new ConnectionLoader(async ({ taskId, options }) => {
    const raw = await queue.listDependentTasks(taskId, options);
    const tasks = raw.tasks;

    return {
      ...raw,
      items: tasks.map(({ task, status }) => new Task(status.taskId, status, task)),
    };
  });
  const listPendingTasks = new ConnectionLoader(async ({ taskQueueId, options }) => {
    const raw = await queue.listPendingTasks(taskQueueId, options);

    return {
      ...raw,
      items: raw.tasks.map(({ taskId, runId, task, inserted }) => ({
        taskId,
        runId,
        inserted,
        task: new Task(taskId, null, task),
      })),
    };
  });
  const listClaimedTasks = new ConnectionLoader(async ({ taskQueueId, options }) => {
    const raw = await queue.listClaimedTasks(taskQueueId, options);

    return {
      ...raw,
      items: raw.tasks.map(({ taskId, runId, task, claimed, workerGroup, workerId }) => ({
        taskId,
        runId,
        claimed,
        workerGroup,
        workerId,
        task: new Task(taskId, null, task),
      })),
    };
  });

  return {
    dependents,
    task,
    indexedTask,
    taskGroup,
    taskActions,
    listPendingTasks,
    listClaimedTasks,
  };
};
