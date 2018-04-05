import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import loadable from '../../utils/loadable';

const ViewTask = loadable(() =>
  import(/* webpackChunkName: 'Tasks.ViewTask' */ './ViewTask')
);
const CreateTask = loadable(() =>
  import(/* webpackChunkName: 'Tasks.CreateTask' */ './CreateTask')
);
const TaskGroup = loadable(() =>
  import(/* webpackChunkName: 'Tasks.TaskGroup' */ './TaskGroup')
);
const TaskIndex = loadable(() =>
  import(/* webpackChunkName: 'Tasks.TaskGroup' */ './TaskGroup')
);

@hot(module)
export default class Task extends Component {
  render() {
    const { match: { path }, ...props } = this.props;

    return (
      <Switch>
        <RouteWithProps
          path={`${path}/groups`}
          {...props}
          component={TaskGroup}
        />
        <RouteWithProps
          path={`${path}/index`}
          {...props}
          component={TaskIndex}
        />
        <RouteWithProps
          path={`${path}/create`}
          {...props}
          component={CreateTask}
        />
        <RouteWithProps
          path={`${path}/:taskId?`}
          {...props}
          component={ViewTask}
        />
      </Switch>
    );
  }
}
