import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import loadable from '../../utils/loadable';

const ViewScopes = loadable(() =>
  import(/* webpackChunkName: 'Clients.ViewScopes' */ './ViewScopes')
);
const ViewScope = loadable(() =>
  import(/* webpackChunkName: 'Clients.ViewScope' */ './ViewScope')
);

@hot(module)
export default class Scopes extends Component {
  render() {
    const {
      match: { path },
      ...props
    } = this.props;

    return (
      <Switch>
        <RouteWithProps
          path={`${path}/:selectedScope`}
          {...props}
          component={ViewScope}
        />
        <RouteWithProps path={path} {...props} component={ViewScopes} />
      </Switch>
    );
  }
}
