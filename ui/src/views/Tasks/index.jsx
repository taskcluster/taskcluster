import React, { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import routes from './routes';

export default class Tasks extends Component {
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
