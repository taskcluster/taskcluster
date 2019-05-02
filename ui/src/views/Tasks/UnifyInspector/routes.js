import lazy from '../../../utils/lazy';

const ViewTask = lazy(() =>
  import(/* webpackChunkName: 'Tasks.ViewTask' */ './ViewTask')
);
const TaskGroup = lazy(() =>
  import(/* webpackChunkName: 'Tasks.TaskGroup' */ './TaskGroup')
);
const taskGroupDescription =
  'Inspect task groups, monitor progress, view dependencies and states, and inspect the individual tasks that make up a task group.';
const taskDescription =
  'Inspect the state, runs, public and private artifacts, definition, and logs of a task.';

export default path => [
  {
    component: TaskGroup,
    path: `${path}/groups/:taskGroupId`,
    description: taskGroupDescription,
  },
  {
    component: ViewTask,
    path: `${path}/:taskId/runs/:runId`,
    description: taskDescription,
  },
  {
    component: ViewTask,
    path: `${path}/:taskId`,
    description: taskDescription,
  },
];
