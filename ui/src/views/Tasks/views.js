import lazy from '../../utils/lazy';

export default {
  NoTask: lazy(() => import(/* webpackChunkName: 'Tasks.NoTask' */ './NoTask')),
  NoTaskGroup: lazy(() =>
    import(/* webpackChunkName: 'Tasks.NoTaskGroup' */ './NoTaskGroup')
  ),
  ViewTask: lazy(() =>
    import(/* webpackChunkName: 'Tasks.ViewTask' */ './ViewTask')
  ),
  TaskLog: lazy(() =>
    import(/* webpackChunkName: 'Tasks.TaskLog' */ './TaskLog')
  ),
  CreateTask: lazy(() =>
    import(/* webpackChunkName: 'Tasks.CreateTask' */ './CreateTask')
  ),
  TaskGroup: lazy(() =>
    import(/* webpackChunkName: 'Tasks.TaskGroup' */ './TaskGroup')
  ),
  TaskIndex: lazy(() =>
    import(/* webpackChunkName: 'Tasks.TaskIndex' */ './TaskIndex')
  ),
  TaskRedirect: lazy(() =>
    import(/* webpackChunkName: 'Tasks.TaskRedirect' */ './TaskRedirect')
  ),
  InteractiveConnect: lazy(() =>
    import(/* webpackChunkName: 'Tasks.InteractiveConnect' */ './InteractiveConnect')
  ),
};
