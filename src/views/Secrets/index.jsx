import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import loadable from '../../utils/loadable';

const ViewSecrets = loadable(() =>
  import(/* webpackChunkName: 'Secrets.ViewSecrets' */ './ViewSecrets')
);
const ViewSecret = loadable(() =>
  import(/* webpackChunkName: 'Secrets.ViewSecret' */ './ViewSecret')
);

@hot(module)
export default class Secrets extends Component {
  render() {
    const {
      match: { path },
      ...props
    } = this.props;

    return (
      <Switch>
        <RouteWithProps
          path={`${path}/create`}
          {...props}
          isNewSecret
          component={ViewSecret}
        />
        <RouteWithProps
          path={`${path}/:secret`}
          {...props}
          component={ViewSecret}
        />
        <RouteWithProps path={path} {...props} component={ViewSecrets} />
      </Switch>
    );
  }
}
