import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { withApollo, graphql } from 'react-apollo';
import { parse, stringify } from 'qs';
import PlusIcon from 'mdi-react/PlusIcon';
import { withStyles } from '@material-ui/core/styles';
import Switch from '@material-ui/core/Switch';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import workerPoolsQuery from './WMWorkerPools.graphql';
import ErrorPanel from '../../../components/ErrorPanel';
import WorkerManagerWorkerPoolsTable from '../../../components/WMWorkerPoolsTable';
import Search from '../../../components/Search';
import Button from '../../../components/Button';
import updateWorkerPoolQuery from '../WMEditWorkerPool/updateWorkerPool.graphql';

@hot(module)
@withApollo
@graphql(workerPoolsQuery, {
  options: () => ({
    fetchPolicy: 'network-only', // so that it refreshes view after editing/creating
  }),
})
@withStyles(theme => ({
  createIconSpan: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
}))
export default class WorkerManagerWorkerPoolsView extends Component {
  state = {
    workerPoolSearch: '',
  };

  handleWorkerPoolSearchSubmit = workerPoolSearch => {
    this.setState({ workerPoolSearch });
  };

  handleCreate = () => {
    this.props.history.push(`${this.props.match.path}/create`);
  };

  deleteRequest = async ({ workerPoolId, payload }) => {
    await this.props.client.mutate({
      mutation: updateWorkerPoolQuery,
      variables: {
        workerPoolId,
        payload: {
          ...payload,
          providerId: 'null-provider', // this is how we delete worker pools
        },
      },
      refetchQueries: ['workerPools'],
      awaitRefetchQueries: false,
    });
  };

  handleSwitchChange = ({ target: { checked } }) => {
    const query = {
      ...parse(this.props.history.location.search.slice(1)),
      include_deleted: checked,
    };

    this.props.history.replace(
      `${this.props.match.path}${stringify(query, { addQueryPrefix: true })}`
    );
  };

  render() {
    const {
      data: { loading, error, WorkerManagerWorkerPoolSummaries },
      classes,
    } = this.props;
    const { workerPoolSearch } = this.state;
    const includeDeleted =
      parse(this.props.history.location.search.slice(1)).include_deleted ===
      'true';

    return (
      <Dashboard
        title="Worker Manager"
        search={
          <Search
            disabled={loading}
            onSubmit={this.handleWorkerPoolSearchSubmit}
            placeholder="Worker pool ID contains"
          />
        }>
        <Fragment>
          {!WorkerManagerWorkerPoolSummaries && loading && <Spinner loading />}
          <ErrorPanel fixed error={error} />
          {WorkerManagerWorkerPoolSummaries && (
            <Fragment>
              <div className={classes.toolbar}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={includeDeleted}
                      onChange={this.handleSwitchChange}
                    />
                  }
                  label="Include worker pools scheduled for deletion"
                />
              </div>
              <WorkerManagerWorkerPoolsTable
                searchTerm={workerPoolSearch}
                workerPools={WorkerManagerWorkerPoolSummaries}
                deleteRequest={this.deleteRequest}
                includeDeleted={includeDeleted}
              />
            </Fragment>
          )}
          <Button
            spanProps={{ className: classes.createIconSpan }}
            tooltipProps={{ title: 'Create Worker Pool' }}
            requiresAuth
            color="secondary"
            variant="round"
            onClick={this.handleCreate}>
            <PlusIcon />
          </Button>
        </Fragment>
      </Dashboard>
    );
  }
}
