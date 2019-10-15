import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Typography from '@material-ui/core/Typography';
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
import ErrorPanel from '../../../components/ErrorPanel';
import Breadcrumbs from '../../../components/Breadcrumbs';
import Link from '../../../utils/Link';
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
  bar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  breadcrumbsPaper: {
    marginRight: theme.spacing.unit * 4,
    flex: 1,
  },
  dropdown: {
    minWidth: 200,
  },
  link: {
    ...theme.mixins.link,
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

    this.setState({ filterBy: target.value });

    refetch({
      provisionerId,
      workerType,
      workersConnection: {
        limit: VIEW_WORKERS_PAGE_SIZE,
      },
      quarantined: target.value === 'Quarantined' ? true : null,
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
          <ErrorPanel fixed error={this.state.error || error} />
          {workers && workerType && (
            <Fragment>
              <div className={classes.bar}>
                <Breadcrumbs classes={{ paper: classes.breadcrumbsPaper }}>
                  <Typography
                    className={classes.link}
                    component={Link}
                    to="/provisioners">
                    Provisioners
                  </Typography>
                  <Typography
                    className={classes.link}
                    component={Link}
                    to={`/provisioners/${params.provisionerId}`}>
                    {params.provisionerId}
                  </Typography>

                  <Typography color="textSecondary">
                    {`${params.workerType}`}
                  </Typography>
                </Breadcrumbs>
                <TextField
                  disabled={loading}
                  className={classes.dropdown}
                  select
                  label="Filter By"
                  value={filterBy || ''}
                  onChange={this.handleFilterChange}>
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
