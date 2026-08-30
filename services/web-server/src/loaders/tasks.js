import DataLoader from 'dataloader';
import { downloadManagedArtifact } from '@taskcluster/client';
import { PassThrough } from 'node:stream';
import ConnectionLoader from '../ConnectionLoader.js';
import Task from '../entities/Task.js';

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

const downloadArtifactToBuffer = async ({ queue, taskId, name }) => {
  let chunks;

  await downloadManagedArtifact({
    taskId,
    name,
    queue,
    streamFactory: async () => {
      chunks = [];
      const stream = new PassThrough();
      stream.on('data', chunk => chunks.push(chunk));
      return stream;
    },
  });

  return Buffer.concat(chunks);
};

export default ({ queue, index }, _isAuthed, _rootUrl, _monitor, _strategies, _req, _cfg, _requestId) => {
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
          const content = await downloadArtifactToBuffer({
            queue,
            taskId: taskGroupId,
            name: 'public/actions.json',
          });
          const raw = JSON.parse(content);

          return raw.actions
            ? {
                ...raw,
                actions: filterTaskActions(raw.actions, contextScope),
              }
            : null;
        } catch (err) {
          // if the artifact does not exist, is an error artifact, or is a `reference`, there are
          // no actions to report
          if (err.statusCode === 404 || err.code === 'ArtifactError' || err.code === 'ArtifactStorageTypeRejected') {
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
  return {
    dependents,
    task,
    indexedTask,
    taskGroup,
    taskActions,
  };
};
