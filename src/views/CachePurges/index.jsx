import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import loadable from '../../utils/loadable';

const ViewCachePurges = loadable(() =>
  import(/* webpackChunkName: 'CachePurges.ViewCachePurges' */ './ViewCachePurges')
);

@hot(module)
export default class CachePurges extends Component {
  render() {
    const {
      match: { path },
      ...props
    } = this.props;

    return (
      <Switch>
        <RouteWithProps path={path} {...props} component={ViewCachePurges} />
      </Switch>
    );
  }
}
