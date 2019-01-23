import { hot } from 'react-hot-loader';
import React, { lazy, Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';

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
const LiveTaskLog = lazy(() =>
  import(/* webpackChunkName: 'Tasks.LiveTaskLog' */ './LiveTaskLog')
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
  import(/* webpackChunkName: 'Tasks.InteractiveConnect' */ './InteractiveConnect')
);

@hot(module)
export default class Task extends Component {
  render() {
    const {
      match: { path },
      ...props
    } = this.props;
    const taskGroupDescription = `Inspect task groups, monitor progress, view dependencies and states, and inspect the individual tasks
      that make up a task group.`;
    const taskDescription = `Inspect the state, runs, public and private artifacts, definition, and logs of
      of a task.`;
    const createTaskDescription = `Write and submit a task to ${
      process.env.APPLICATION_NAME
    }.`;

    return (
      <Switch>
        <RouteWithProps
          path={`${path}/groups/:taskGroupId`}
          {...props}
          component={TaskGroup}
          description={taskGroupDescription}
        />
        <RouteWithProps
          path={`${path}/groups`}
          {...props}
          component={NoTaskGroup}
          description={taskGroupDescription}
        />
        <RouteWithProps
          path={`${path}/index`}
          {...props}
          component={TaskIndex}
          description="The generic index browser lets you browse through the hierarchy of namespaces in
      the index, and discover indexed tasks."
        />
        <RouteWithProps
          path={`${path}/create/interactive`}
          component={CreateTask}
          description={createTaskDescription}
          interactive
        />
        <RouteWithProps
          path={`${path}/create`}
          {...props}
          description={createTaskDescription}
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
          description={taskDescription}
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
          description={taskDescription}
        />
        <RouteWithProps
          path={path}
          {...props}
          component={NoTask}
          description={taskDescription}
        />
      </Switch>
    );
  }
}
