import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import views from './views';

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
          component={views.TaskGroup}
          description={taskGroupDescription}
        />
        <RouteWithProps
          path={`${path}/groups`}
          {...props}
          component={views.NoTaskGroup}
          description={taskGroupDescription}
        />
        <RouteWithProps
          path={`${path}/index`}
          {...props}
          component={views.TaskIndex}
          description="The generic index browser lets you browse through the hierarchy of namespaces in
      the index, and discover indexed tasks."
        />
        <RouteWithProps
          path={`${path}/create/interactive`}
          component={views.CreateTask}
          description={createTaskDescription}
          interactive
        />
        <RouteWithProps
          path={`${path}/create`}
          {...props}
          description={createTaskDescription}
          component={views.CreateTask}
        />
        <RouteWithProps
          path={`${path}/:taskId/runs/:runId/logs/live/:logUrl`}
          stream
          {...props}
          component={views.TaskLog}
        />
        <RouteWithProps
          path={`${path}/:taskId/runs/:runId/logs/:logUrl`}
          {...props}
          component={views.TaskLog}
        />
        <RouteWithProps
          path={`${path}/:taskId/runs/:runId`}
          {...props}
          component={views.ViewTask}
          description={taskDescription}
        />
        <RouteWithProps
          path={`${path}/:taskId/connect`}
          component={views.InteractiveConnect}
        />
        <RouteWithProps
          path={`${path}/:taskId/:action`}
          component={views.TaskRedirect}
        />
        <RouteWithProps
          path={`${path}/:taskId`}
          {...props}
          component={views.ViewTask}
          description={taskDescription}
        />
        <RouteWithProps
          path={path}
          {...props}
          component={views.NoTask}
          description={taskDescription}
        />
      </Switch>
    );
  }
}
