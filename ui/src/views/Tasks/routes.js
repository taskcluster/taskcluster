import indexedTaskRoutes from './TaskIndex/routes';
import lazy from '../../utils/lazy';

const NoTask = lazy(() => import('./NoTask'));
const NoTaskGroup = lazy(() => import('./NoTaskGroup'));
const ViewTask = lazy(() => import('./ViewTask'));
const TaskArtifactRedirect = lazy(() => import('./TaskArtifactRedirect'));
const TaskLog = lazy(() => import('./TaskLog'));
const CreateTask = lazy(() => import('./CreateTask'));
const TaskGroup = lazy(() => import('./TaskGroup'));
const TaskDefinition = lazy(() => import('./TaskDefinition'));
const TaskIndex = lazy(() => import('./TaskIndex'));
const TaskRedirect = lazy(() => import('./TaskRedirect'));
const InteractiveConnect = lazy(() => import('./InteractiveConnect'));
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
    path: `${path}/:taskId/runs/:runId/logs/live/:name+`,
    stream: true,
  },
  {
    component: TaskLog,
    path: `${path}/:taskId/runs/:runId/logs/:name+`,
  },
  {
    component: TaskArtifactRedirect,
    path: `${path}/:taskId/runs/:runId/:artifactName+`,
    description: taskDescription,
  },
  {
    component: ViewTask,
    path: `${path}/:taskId/runs/:runId`,
    description: taskDescription,
  },
  {
    component: TaskDefinition,
    path: `${path}/:taskId/definition`,
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
