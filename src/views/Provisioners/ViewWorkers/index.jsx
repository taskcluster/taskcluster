import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import MenuItem from '@material-ui/core/MenuItem';
import TextField from '@material-ui/core/TextField';
import HammerIcon from 'mdi-react/HammerIcon';
import SpeedDial from '../../../components/SpeedDial';
import SpeedDialAction from '../../../components/SpeedDialAction';
import DialogAction from '../../../components/DialogAction';
import WorkersTable from '../../../components/WorkersTable';
import Dashboard from '../../../components/Dashboard';
import { VIEW_WORKERS_PAGE_SIZE } from '../../../utils/constants';
import { withAuth } from '../../../utils/Auth';
import workersQuery from './workers.graphql';

@hot(module)
@withAuth
@graphql(workersQuery, {
  skip: props => !props.match.params.provisionerId,
  options: ({ match: { params } }) => ({
    variables: {
      provisionerId: params.provisionerId,
      workerType: params.workerType,
      workersConnection: {
        limit: VIEW_WORKERS_PAGE_SIZE,
      },
    },
  }),
})
@withStyles(theme => ({
  actionBar: {
    display: 'flex',
    flexDirection: 'row-reverse',
  },
  dropdown: {
    minWidth: 200,
    marginBottom: theme.spacing.double,
  },
}))
export default class ViewWorkers extends Component {
  state = {
    filterBy: null,
    actionLoading: false,
    dialogError: null,
    dialogOpen: false,
    selectedAction: null,
  };

  handleActionClick = async selectedAction => {
    this.setState({ dialogOpen: true, selectedAction });
  };

  handleActionError = dialogError => {
    this.setState({ dialogError, actionLoading: false });
  };

  // TODO: Action not working
  handleActionSubmit = async () => {
    const { selectedAction } = this.state;
    const {
      match: { params },
    } = this.props;
    const url = selectedAction.url
      .replace('<provisionerId>', params.provisionerId)
      .replace('<workerType>', params.workerType);

    this.setState({ actionLoading: true, dialogError: null });

    await fetch(url, {
      method: selectedAction.method,
      Authorization: `Bearer ${btoa(
        JSON.stringify(this.props.user.credentials)
      )}`,
    });

    this.setState({ actionLoading: false });
  };

  handleDialogClose = () => {
    this.setState({ dialogOpen: false, selectedAction: null });
  };

  handleFilterChange = ({ target }) => {
    const {
      data: { refetch },
      match: {
        params: { provisionerId, workerType },
      },
    } = this.props;
    const quarantinedOpts =
      target.value === 'Quarantined' ? { quarantined: true } : null;

    this.setState({ filterBy: target.value });

    refetch({
      provisionerId,
      workerType,
      workersConnection: {
        limit: VIEW_WORKERS_PAGE_SIZE,
      },
      ...quarantinedOpts,
    });
  };

  handlePageChange = ({ cursor, previousCursor }) => {
    const {
      match: {
        params: { provisionerId, workerType },
      },
      data: { fetchMore },
    } = this.props;

    return fetchMore({
      query: workersQuery,
      variables: {
        provisionerId,
        workerType,
        workersConnection: {
          limit: VIEW_WORKERS_PAGE_SIZE,
          cursor,
          previousCursor,
        },
      },
      updateQuery(previousResult, { fetchMoreResult }) {
        const { edges, pageInfo } = fetchMoreResult.workers;

        if (!edges.length) {
          return previousResult;
        }

        return dotProp.set(previousResult, 'workers', workers =>
          dotProp.set(
            dotProp.set(workers, 'edges', edges),
            'pageInfo',
            pageInfo
          )
        );
      },
    });
  };

  render() {
    const {
      filterBy,
      actionLoading,
      selectedAction,
      dialogOpen,
      dialogError,
    } = this.state;
    const {
      classes,
      match: { params },
      data: { loading, error, workers, workerType },
    } = this.props;

    return (
      <Dashboard title="Workers">
        <Fragment>
          {(!workers || !workerType) && loading && <Spinner loading />}
          {this.state.error && <ErrorPanel error={this.state.error} />}
          {error && error.graphQLErrors && <ErrorPanel error={error} />}
          {workers &&
            workerType && (
              <Fragment>
                <div className={classes.actionBar}>
                  <TextField
                    disabled={loading}
                    className={classes.dropdown}
                    select
                    label="Filter By"
                    value={filterBy || ''}
                    onChange={this.handleFilterChange}
                  >
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                    <MenuItem value="Quarantined">Quarantined</MenuItem>
                  </TextField>
                </div>
                <br />
                <WorkersTable
                  workersConnection={workers}
                  onPageChange={this.handlePageChange}
                  workerType={params.workerType}
                  provisionerId={params.provisionerId}
                />
                {workerType.actions.length ? (
                  <SpeedDial>
                    {workerType.actions.map(action => (
                      <SpeedDialAction
                        requiresAuth
                        tooltipOpen
                        key={action.title}
                        ButtonProps={{
                          color: 'secondary',
                          disabled: actionLoading,
                        }}
                        icon={<HammerIcon />}
                        tooltipTitle={action.title}
                        onClick={() => this.handleActionClick(action)}
                      />
                    ))}
                  </SpeedDial>
                ) : null}
              </Fragment>
            )}
          {dialogOpen && (
            <DialogAction
              error={dialogError}
              open={dialogOpen}
              title={`${selectedAction.title}?`}
              body={selectedAction.description}
              confirmText={selectedAction.title}
              onSubmit={this.handleActionSubmit}
              onError={this.handleActionError}
              onComplete={this.handleDialogClose}
              onClose={this.handleDialogClose}
            />
          )}
        </Fragment>
      </Dashboard>
    );
  }
}
