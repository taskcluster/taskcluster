import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import { withRouter } from 'react-router-dom';
import PlusIcon from 'mdi-react/PlusIcon';
import { withStyles } from '@material-ui/core';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import workerTypesQuery from './WMWorkerTypes.graphql';
import ErrorPanel from '../../../components/ErrorPanel';
import WorkerManagerWorkerTypesTable from '../../../components/WMWorkerTypesTable';
import Search from '../../../components/Search';
import Button from '../../../components/Button';

@hot(module)
@graphql(workerTypesQuery)
@withRouter
@withStyles(theme => ({
  createIcon: {
    ...theme.mixins.successIcon,
  },
  createIconSpan: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
    right: theme.spacing.unit * 11,
  },
}))
export default class WorkerManagerWorkerTypesView extends Component {
  state = {
    workerTypeSearch: '',
  };

  handleWorkerTypeSearchSubmit = workerTypeSearch => {
    this.setState({ workerTypeSearch });
  };

  handleCreate = () => {
    this.props.history.push(`${this.props.match.path}/create`);
  };

  render() {
    const {
      data: { loading, error, WorkerManagerWorkerTypeSummaries },
      classes,
    } = this.props;
    const { workerTypeSearch } = this.state;

    return (
      <Dashboard
        title="Worker Types"
        search={
          <Search
            disabled={loading}
            onSubmit={this.handleWorkerTypeSearchSubmit}
            placeholder="Worker type contains"
          />
        }>
        <Fragment>
          {!WorkerManagerWorkerTypeSummaries && loading && <Spinner loading />}
          <ErrorPanel fixed error={error} />
          {WorkerManagerWorkerTypeSummaries && (
            <WorkerManagerWorkerTypesTable
              searchTerm={workerTypeSearch}
              workerTypes={WorkerManagerWorkerTypeSummaries}
            />
          )}
          <Button
            spanProps={{ className: classes.createIconSpan }}
            tooltipProps={{ title: 'Create Worker Pool' }}
            requiresAuth
            variant="round"
            className={classes.createIcon}
            onClick={this.handleCreate}>
            <PlusIcon />
          </Button>
        </Fragment>
      </Dashboard>
    );
  }
}
