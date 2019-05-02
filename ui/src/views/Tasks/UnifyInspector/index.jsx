import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { Switch } from 'react-router-dom';
import { graphql } from 'react-apollo';
import RouteWithProps from '../../../components/RouteWithProps';
import routes from './routes';
import {
  ACTIONS_JSON_KNOWN_KINDS,
  ARTIFACTS_PAGE_SIZE,
  TASK_POLL_INTERVAL,
} from '../../../utils/constants';
import taskQuery from './task.graphql';

@hot(module)
@graphql(taskQuery, {
  options: props => ({
    fetchPolicy: 'network-only',
    pollInterval: TASK_POLL_INTERVAL,
    errorPolicy: 'all',
    variables: {
      taskId: props.match.params.taskId,
      artifactsConnection: {
        limit: ARTIFACTS_PAGE_SIZE,
      },
      taskActionsFilter: {
        kind: {
          $in: ACTIONS_JSON_KNOWN_KINDS,
        },
        context: {
          $not: {
            $size: 0,
          },
        },
      },
    },
  }),
})

export default class UnifiyInspector extends Component {
  render() {
    const {
      match: { path },
    } = this.props;

    return (
      <Switch>
        {routes(path).map(({ routes, ...routeProps }) => (
          <RouteWithProps
            key={routeProps.path || 'not-found'}
            {...routeProps}
          />
        ))}
      </Switch>
    );
  }
}
