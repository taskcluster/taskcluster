import React, { Component } from 'react';
import { Queue } from '@taskcluster/client-web';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import ErrorPanel from '../../../components/ErrorPanel';
import ProvisionerDetailsTable from '../../../components/ProvisionerDetailsTable';
import fetchAllPages from '../../../utils/fetchAllPages';
import fetchTaskQueueCounts from '../../../utils/fetchTaskQueueCounts';
import aggregateCountsByProvisioner from '../../../utils/aggregateCountsByProvisioner';
import { DASHBOARD_STATS_PAGE_SIZE } from '../../../utils/constants';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';

@withTaskclusterClient
export default class ViewProvisioners extends Component {
  state = {
    provisioners: [],
    loading: true,
    error: null,
    counts: undefined,
    countsError: null,
  };

  countsRequestId = 0;

  async componentDidMount() {
    try {
      const { provisioners } = await this.queue.listProvisioners();

      this.setState({ provisioners, loading: false });
    } catch (error) {
      this.setState({ error, loading: false });

      return;
    }

    // The table is already visible; counts fill in afterwards.
    this.loadCounts();
  }

  componentWillUnmount() {
    this.countsRequestId++;
  }

  get queue() {
    return this.props.createTaskclusterClient({ Class: Queue });
  }

  loadCounts = async () => {
    const requestId = ++this.countsRequestId;
    const { queue } = this;

    try {
      const taskQueues = await fetchAllPages(
        options => queue.listTaskQueues(options),
        response => response.taskQueues,
        { limit: DASHBOARD_STATS_PAGE_SIZE }
      );
      const taskQueueCounts = await fetchTaskQueueCounts(
        queue,
        taskQueues.map(({ taskQueueId }) => taskQueueId)
      );

      if (requestId !== this.countsRequestId) {
        return;
      }

      this.setState({ counts: aggregateCountsByProvisioner(taskQueueCounts) });
    } catch (countsError) {
      if (requestId !== this.countsRequestId) {
        return;
      }

      this.setState({ counts: null, countsError });
    }
  };

  render() {
    const { description } = this.props;
    const { provisioners, loading, error, counts, countsError } = this.state;

    return (
      <Dashboard
        title="Workers"
        helpView={<HelpView description={description} />}>
        {loading && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        <ErrorPanel
          warning
          error={
            countsError &&
            (countsError.body?.code === 'InsufficientScopes'
              ? 'Failed to load task queue counts. Counts require the ' +
                'queue:list-task-queues, queue:pending-count and ' +
                'queue:claimed-count scopes for every task queue.'
              : `Failed to load task queue counts: ${countsError.message}`)
          }
        />
        {provisioners.length > 0 && (
          <ProvisionerDetailsTable
            provisioners={provisioners}
            counts={counts}
          />
        )}
      </Dashboard>
    );
  }
}
