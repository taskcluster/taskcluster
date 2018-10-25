import { hot } from 'react-hot-loader';
import React, { Component, lazy } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../../components/RouteWithProps';

const ListNamespaces = lazy(() =>
  import(/* webpackChunkName: 'TaskIndex.ListNamespaces' */ './ListNamespaces')
);
const IndexedTask = lazy(() =>
  import(/* webpackChunkName: 'TaskIndex.IndexedTask' */ './IndexedTask')
);

@hot(module)
export default class TaskIndex extends Component {
  render() {
    const {
      match: { path },
      ...props
    } = this.props;

    return (
      <Switch>
        <RouteWithProps
          path={`${path}/:namespace/:namespaceTaskId`}
          {...props}
          component={IndexedTask}
        />
        <RouteWithProps
          path={`${path}/:namespace?`}
          {...props}
          component={ListNamespaces}
        />
      </Switch>
    );
  }
}
