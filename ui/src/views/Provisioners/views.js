import lazy from '../../utils/lazy';

export default {
  ViewProvisioners: lazy(() =>
    import(/* webpackChunkName: 'Provisioners.ViewProvisioners' */ './ViewProvisioners')
  ),
  ViewWorkerTypes: lazy(() =>
    import(/* webpackChunkName: 'Provisioners.ViewWorkerTypes' */ './ViewWorkerTypes')
  ),
  ViewWorker: lazy(() =>
    import(/* webpackChunkName: 'Provisioners.ViewWorker' */ './ViewWorker')
  ),
  ViewWorkers: lazy(() =>
    import(/* webpackChunkName: 'Provisioners.ViewWorkers' */ './ViewWorkers')
  ),
};
