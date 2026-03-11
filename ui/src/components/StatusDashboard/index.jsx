import React, { Component } from 'react';
import { object } from 'prop-types';
import summarizeWorkerPools from './summarizeWorkerPools';
import summarizeWorkerPoolsStats from './summarizeWorkerPoolsStats';
import summarizeProvisioners from './summarizeProvisioners';
import summarizeHooks from './summarizeHooks';
import summarizeAuthorization from './summarizeAuthorization';
import StatusGroup from './StatusGroup';

export default class StatusDashboard extends Component {
  static propTypes = {
    workerPools: object,
    provisioners: object,
    hookGroups: object,
    clients: object,
    secrets: object,
    roles: object,
    wmStats: object,
  };

  static defaultProps = {
    workerPools: {},
    provisioners: {},
    hookGroups: {},
    clients: {},
    secrets: {},
    roles: {},
    wmStats: {},
  };

  render() {
    const {
      workerPools,
      wmStats,
      provisioners,
      hookGroups,
      clients,
      roles,
      secrets,
    } = this.props;
    const filterAvailable = items =>
      items.filter(item => !item.loading && !item.error);
    const widgets = {
      'Worker Manager Provisioning': filterAvailable(
        summarizeWorkerPools(workerPools, 'provisioning')
      ),
      'Worker Manager Errors': summarizeWorkerPoolsStats(wmStats),
      'Worker Manager Stats': filterAvailable(
        summarizeWorkerPools(workerPools, 'stats')
      ),
      'Worker Provisioners': filterAvailable(
        summarizeProvisioners(provisioners)
      ),
      Hooks: filterAvailable(summarizeHooks(hookGroups)),
      Authorization: filterAvailable(
        summarizeAuthorization(clients, roles, secrets)
      ),
    };

    return <StatusGroup widgets={widgets} />;
  }
}
