import lazy from '../../utils/lazy';

export default {
  ViewClients: lazy(() =>
    import(/* webpackChunkName: 'Clients.ViewClients' */ './ViewClients')
  ),
  ViewClient: lazy(() =>
    import(/* webpackChunkName: 'Clients.ViewClient' */ './ViewClient')
  ),
};
