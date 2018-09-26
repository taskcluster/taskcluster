import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import loadable from '../../utils/loadable';

const NoTask = loadable(() =>
  import(/* webpackChunkName: 'Tasks.NoTask' */ './NoTask')
);
const NoTaskGroup = loadable(() =>
  import(/* webpackChunkName: 'Tasks.NoTaskGroup' */ './NoTaskGroup')
);
const ViewTask = loadable(() =>
  import(/* webpackChunkName: 'Tasks.ViewTask' */ './ViewTask')
);
const TaskLog = loadable(() =>
  import(/* webpackChunkName: 'Tasks.TaskLog' */ './TaskLog')
);
const LiveTaskLog = loadable(() =>
  import(/* webpackChunkName: 'Tasks.LiveTaskLog' */ './LiveTaskLog')
);
const CreateTask = loadable(() =>
  import(/* webpackChunkName: 'Tasks.CreateTask' */ './CreateTask')
);
const TaskGroup = loadable(() =>
  import(/* webpackChunkName: 'Tasks.TaskGroup' */ './TaskGroup')
);
const TaskIndex = loadable(() =>
  import(/* webpackChunkName: 'Tasks.TaskIndex' */ './TaskIndex')
);
const TaskRedirect = loadable(() =>
  import(/* webpackChunkName: 'Tasks.TaskRedirect' */ './TaskRedirect')
);
const InteractiveConnect = loadable(() =>
  import(/* webpackChunkName: 'Tasks.InteractiveConnect' */ './InteractiveConnect')
);

@hot(module)
export default class Task extends Component {
  render() {
    const {
      match: { path },
      ...props
    } = this.props;

    return (
      <Switch>
        <RouteWithProps
          path={`${path}/groups/:taskGroupId`}
          {...props}
          component={TaskGroup}
        />
        <RouteWithProps
          path={`${path}/groups`}
          {...props}
          component={NoTaskGroup}
        />
        <RouteWithProps
          path={`${path}/index`}
          {...props}
          component={TaskIndex}
        />
        <RouteWithProps
          path={`${path}/create/interactive`}
          component={CreateTask}
          interactive
        />
        <RouteWithProps
          path={`${path}/create`}
          {...props}
          component={CreateTask}
        />
        <RouteWithProps
          path={`${path}/:taskId/runs/:runId/logs/live/:logUrl`}
          {...props}
          component={LiveTaskLog}
        />
        <RouteWithProps
          path={`${path}/:taskId/runs/:runId/logs/:logUrl`}
          {...props}
          component={TaskLog}
        />
        <RouteWithProps
          path={`${path}/:taskId/runs/:runId`}
          {...props}
          component={ViewTask}
        />
        <RouteWithProps
          path={`${path}/:taskId/connect`}
          component={InteractiveConnect}
        />
        <RouteWithProps
          path={`${path}/:taskId/:action`}
          component={TaskRedirect}
        />
        <RouteWithProps
          path={`${path}/:taskId`}
          {...props}
          component={ViewTask}
        />
        <RouteWithProps path={path} {...props} component={NoTask} />
      </Switch>
    );
  }
}
