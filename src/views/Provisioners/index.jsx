import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import loadable from '../../utils/loadable';

const ViewProvisioners = loadable(() =>
  import(/* webpackChunkName: 'Provisioners.ViewProvisioners' */ './ViewProvisioners')
);
const ViewWorkerTypes = loadable(() =>
  import(/* webpackChunkName: 'Provisioners.ViewWorkerTypes' */ './ViewWorkerTypes')
);
const ViewWorker = loadable(() =>
  import(/* webpackChunkName: 'Provisioners.ViewWorker' */ './ViewWorker')
);
const ViewWorkers = loadable(() =>
  import(/* webpackChunkName: 'Provisioners.ViewWorkers' */ './ViewWorkers')
);

@hot(module)
export default class Provisioners extends Component {
  render() {
    const {
      match: { path },
      ...props
    } = this.props;

    return (
      <Switch>
        <RouteWithProps
          path={`${path}/:provisionerId/worker-types/:workerType/workers/:workerGroup/:workerId`}
          {...props}
          component={ViewWorker}
        />
        <RouteWithProps
          path={`${path}/:provisionerId/worker-types/:workerType`}
          {...props}
          component={ViewWorkers}
        />
        <RouteWithProps
          path={`${path}/:provisionerId`}
          {...props}
          component={ViewWorkerTypes}
        />
        <RouteWithProps path={path} {...props} component={ViewProvisioners} />
      </Switch>
    );
  }
}
