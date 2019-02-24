import views from './views';
import indexedTaskRoutes from './TaskIndex/routes';

const taskGroupDescription =
  'Inspect task groups, monitor progress, view dependencies and states, and inspect the individual tasks that make up a task group.';
const taskDescription =
  'Inspect the state, runs, public and private artifacts, definition, and logs of a task.';
const createTaskDescription = `Write and submit a task to ${
  process.env.APPLICATION_NAME
}.`;
const taskIndexDescription =
  'The generic index browser lets you browse through the hierarchy of namespaces in the index, and discover indexed tasks.';

export default path =>
  console.log('path: ', path) || [
    {
      component: views.TaskGroup,
      path: `${path}/groups/:taskGroupId`,
      description: taskGroupDescription,
    },
    {
      component: views.NoTaskGroup,
      path: `${path}/groups`,
      description: taskGroupDescription,
    },
    {
      component: views.TaskIndex,
      path: `${path}/index`,
      description: taskIndexDescription,
      routes: indexedTaskRoutes,
    },
    {
      component: views.CreateTask,
      path: `${path}/create/interactive`,
      description: createTaskDescription,
    },
    {
      component: views.CreateTask,
      path: `${path}/create`,
      description: createTaskDescription,
    },
    {
      component: views.TaskLog,
      path: `${path}/:taskId/runs/:runId/logs/live/:logUrl`,
      stream: true,
    },
    {
      component: views.TaskLog,
      path: `${path}/:taskId/runs/:runId/logs/:logUrl`,
    },
    {
      component: views.ViewTask,
      path: `${path}/:taskId/runs/:runId`,
      description: taskDescription,
    },
    {
      component: views.InteractiveConnect,
      path: `${path}/:taskId/connect`,
    },
    {
      component: views.TaskRedirect,
      path: `${path}/:taskId/:action`,
    },
    {
      component: views.ViewTask,
      path: `${path}/:taskId`,
      description: taskDescription,
    },
    {
      component: views.NoTask,
      path,
      description: taskDescription,
    },
  ];
