import indexedTaskRoutes from './TaskIndex/routes';
import lazy from '../../utils/lazy';

const NoTask = lazy(() =>
  import(/* webpackChunkName: 'Tasks.NoTask' */ './NoTask')
);
const NoTaskGroup = lazy(() =>
  import(/* webpackChunkName: 'Tasks.NoTaskGroup' */ './NoTaskGroup')
);
const ViewTask = lazy(() =>
  import(/* webpackChunkName: 'Tasks.ViewTask' */ './ViewTask')
);
const TaskLog = lazy(() =>
  import(/* webpackChunkName: 'Tasks.TaskLog' */ './TaskLog')
);
const CreateTask = lazy(() =>
  import(/* webpackChunkName: 'Tasks.CreateTask' */ './CreateTask')
);
const TaskGroup = lazy(() =>
  import(/* webpackChunkName: 'Tasks.TaskGroup' */ './TaskGroup')
);
const TaskIndex = lazy(() =>
  import(/* webpackChunkName: 'Tasks.TaskIndex' */ './TaskIndex')
);
const TaskRedirect = lazy(() =>
  import(/* webpackChunkName: 'Tasks.TaskRedirect' */ './TaskRedirect')
);
const InteractiveConnect = lazy(() =>
  import(
    /* webpackChunkName: 'Tasks.InteractiveConnect' */ './InteractiveConnect'
  )
);
const taskGroupDescription =
  'Inspect task groups, monitor progress, view dependencies and states, and inspect the individual tasks that make up a task group.';
const taskDescription =
  'Inspect the state, runs, public and private artifacts, definition, and logs of a task.';
const createTaskDescription = `Write and submit a task to ${window.env.APPLICATION_NAME}.`;

export default path => [
  {
    component: TaskGroup,
    path: `${path}/groups/:taskGroupId`,
    description: taskGroupDescription,
  },
  {
    component: NoTaskGroup,
    path: `${path}/groups`,
    description: taskGroupDescription,
  },
  {
    component: TaskIndex,
    path: `${path}/index`,
    routes: indexedTaskRoutes(`${path}/index`),
  },
  {
    component: CreateTask,
    path: `${path}/create`,
    description: createTaskDescription,
  },
  {
    component: TaskLog,
    path: `${path}/:taskId/runs/:runId/logs/live/:logUrl`,
    stream: true,
  },
  {
    component: TaskLog,
    path: `${path}/:taskId/runs/:runId/logs/:logUrl`,
  },
  {
    component: ViewTask,
    path: `${path}/:taskId/runs/:runId`,
    description: taskDescription,
  },
  {
    component: InteractiveConnect,
    path: `${path}/:taskId/connect`,
  },
  {
    component: TaskRedirect,
    path: `${path}/:taskId/:action`,
  },
  {
    component: ViewTask,
    path: `${path}/:taskId`,
    description: taskDescription,
  },
  {
    component: NoTask,
    path,
    description: taskDescription,
  },
];
