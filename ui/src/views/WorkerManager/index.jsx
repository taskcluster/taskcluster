import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { Switch } from 'react-router-dom';
import routes from './routes';
import RouteWithProps from '../../components/RouteWithProps';

@hot(module)
export default class WorkerManager extends Component {
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
