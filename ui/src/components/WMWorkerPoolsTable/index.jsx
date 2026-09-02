import React, { Component, Fragment } from 'react';
import { withStyles } from '@material-ui/core';
import { func, arrayOf, string, bool } from 'prop-types';
import { camelCase } from 'camel-case';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import Hidden from '@material-ui/core/Hidden';
import LinkIcon from 'mdi-react/LinkIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import WorkerIcon from 'mdi-react/WorkerIcon';
import MessageAlertIcon from 'mdi-react/MessageAlertIcon';
import { withRouter } from 'react-router-dom';
import {
  WorkerManagerWorkerPoolSummary,
  pagination,
} from '../../utils/prop-types';
import Label from '../Label';
import PaginatedDataTable from '../PaginatedDataTable';
import sort from '../../utils/sort';
import Link from '../../utils/Link';
import Button from '../Button';
import TableCellItem from '../TableCellItem';
import DialogAction from '../DialogAction';
import {
  NULL_PROVIDER,
  VIEW_WORKER_POOLS_PAGE_SIZE,
} from '../../utils/constants';
import { splitWorkerPoolId } from '../../utils/workerPool';

@withRouter
@withStyles(theme => ({
  button: {
    marginLeft: -theme.spacing(2),
    marginRight: theme.spacing(1),
    borderRadius: 4,
  },
  linksIcon: {
    marginRight: theme.spacing(1),
  },
  linksButton: {
    marginRight: theme.spacing(3),
  },
  hiddenLabel: {
    display: 'inline-block',
    width: theme.spacing(16),
    color: theme.palette.text.hint,
    [theme.breakpoints.up('md')]: {
      display: 'none',
    },
  },
  errorsPool: {
    color: theme.palette.error.dark,
  },
}))
export default class WorkerManagerWorkerPoolsTable extends Component {
  static propTypes = {
    workerPools: arrayOf(WorkerManagerWorkerPoolSummary).isRequired,
    deleteRequest: func.isRequired,
    searchTerm: string,
    loading: bool,
    errorStatsLoading: bool,
    ...pagination,
  };

  static defaultProps = {
    searchTerm: null,
    loading: false,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  state = {
    sortBy: 'workerPoolId',
    sortDirection: 'asc',
    actionLoading: false,
    dialogState: {
      error: null,
      open: false,
      title: '',
      body: '',
      confirmText: '',
      item: null,
    },
  };

  sortWorkerPools = (workerPools, sortBy, sortDirection) => {
    if (!sortBy) {
      return workerPools;
    }

    const sortByProperty = camelCase(sortBy);

    return [...workerPools].sort((a, b) => {
      const firstElement =
        sortDirection === 'desc' ? b[sortByProperty] : a[sortByProperty];
      const secondElement =
        sortDirection === 'desc' ? a[sortByProperty] : b[sortByProperty];

      return sort(firstElement, secondElement);
    });
  };

  handleHeaderClick = header => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === header ? toggled : 'desc';

    this.setState({ sortBy: header, sortDirection });
  };

  handleDeleteClick = async () => {
    const { item } = this.state.dialogState;
    const payload = {
      providerId: item.providerId,
      description: item.description,
      config: item.config,
      owner: item.owner,
      emailOnError: item.emailOnError,
    };

    this.setState({
      dialogState: {
        ...this.state.dialogState,
        error: null,
      },
    });

    try {
      await this.props.deleteRequest({
        workerPoolId: item.workerPoolId,
        payload,
      });
      this.setState({
        dialogState: {
          ...this.state.dialogState,
          open: false,
        },
      });
    } catch (error) {
      this.handleDialogActionError(error);
    }
  };

  handleDialogActionOpen = workerPool => () => {
    this.setState({
      dialogState: {
        open: true,
        title: 'Delete Worker Pool?',
        body: `This will delete the worker pool ${workerPool.workerPoolId}.`,
        confirmText: 'Delete Worker Pool',
        item: workerPool,
      },
    });
  };

  handleDialogActionError = error => {
    this.setState({
      dialogState: {
        ...this.state.dialogState,
        error,
      },
    });
  };

  handleDialogActionClose = () => {
    this.setState({
      dialogState: {
        ...this.state.dialogState,
        error: null,
        open: false,
      },
    });
  };

  getPendingTasksLink(workerPoolId) {
    const { provisionerId, workerType } = splitWorkerPoolId(workerPoolId);

    return `/provisioners/${provisionerId}/worker-types/${workerType}/pending-tasks`;
  }

  renderRow = workerPool => {
    const {
      match: { path },
      classes,
      errorStatsLoading,
    } = this.props;
    const { actionLoading } = this.state;
    const iconSize = 16;
    const { provisionerId, workerType } = splitWorkerPoolId(
      workerPool.workerPoolId
    );

    return (
      <TableRow key={workerPool.workerPoolId} hover>
        <TableCell>
          <Link to={`${path}/${encodeURIComponent(workerPool.workerPoolId)}`}>
            <TableCellItem button>
              {workerPool.workerPoolId}
              <LinkIcon size={iconSize} />
            </TableCellItem>
          </Link>
        </TableCell>

        <TableCell>
          {workerPool.providerId !== NULL_PROVIDER ? (
            <Typography variant="body2">{workerPool.providerId}</Typography>
          ) : (
            <em>n/a</em>
          )}
        </TableCell>

        <TableCell>
          <Hidden lgUp implementation="css" className={classes.hiddenLabel}>
            Current Capacity:
          </Hidden>
          {workerPool.currentCapacity}
        </TableCell>

        <TableCell>
          <Hidden lgUp implementation="css" className={classes.hiddenLabel}>
            Running Capacity:
          </Hidden>
          {workerPool.runningCapacity}
        </TableCell>

        <TableCell>
          <Link to={this.getPendingTasksLink(workerPool.workerPoolId)}>
            <TableCellItem button>
              <Hidden lgUp implementation="css" className={classes.hiddenLabel}>
                Pending Tasks:
              </Hidden>
              {workerPool.pendingTasks === undefined
                ? '...'
                : (workerPool.pendingTasks ?? 'n/a')}
              <LinkIcon size={iconSize} />
            </TableCellItem>
          </Link>
        </TableCell>

        <TableCell>
          <Link
            title={`View ${workerPool.workerPoolId} workers`}
            to={`${path}/${encodeURIComponent(
              workerPool.workerPoolId
            )}/errors`}>
            <TableCellItem button>
              <div
                className={
                  workerPool.errorsCount > 0 ? classes.errorsPool : ''
                }>
                <Hidden
                  lgUp
                  implementation="css"
                  className={classes.hiddenLabel}>
                  Total Errors:
                </Hidden>
                {errorStatsLoading ? '...' : workerPool.errorsCount}
              </div>
              <MessageAlertIcon className={classes.linksIcon} size={iconSize} />
            </TableCellItem>
          </Link>
        </TableCell>

        <TableCell>
          <Link
            to={`/provisioners/${provisionerId}/worker-types/${workerType}`}>
            <Button
              className={classes.linksButton}
              variant="outlined"
              disabled={actionLoading}
              size="small">
              <WorkerIcon className={classes.linksIcon} size={iconSize} />
              Workers
            </Button>
          </Link>
          {workerPool.providerId !== NULL_PROVIDER ? (
            <IconButton
              title={`Delete Worker Pool ${workerPool.workerPoolId}`}
              className={classes.button}
              name={`${workerPool.workerPoolId}`}
              onClick={this.handleDialogActionOpen(workerPool)}
              disabled={actionLoading}>
              <DeleteIcon size={iconSize} />
            </IconButton>
          ) : (
            <Label mini status="warning" className={classes.button}>
              Scheduled for deletion
            </Label>
          )}
        </TableCell>
      </TableRow>
    );
  };

  render() {
    const {
      workerPools,
      searchTerm,
      loading,
      page,
      hasNextPage,
      hasPreviousPage,
      onNextPage,
      onPreviousPage,
    } = this.props;
    const {
      sortBy,
      sortDirection,
      dialogState: { open, error, title, confirmText, body },
    } = this.state;
    const sortedWorkerPools = this.sortWorkerPools(
      workerPools,
      sortBy,
      sortDirection
    );
    const headers = [
      'Worker Pool ID',
      'Provider ID',
      'Current Capacity',
      'Running Capacity',
      'Pending Tasks',
      'Errors Count',
      '',
    ];

    return (
      <Fragment>
        <PaginatedDataTable
          searchTerm={searchTerm}
          items={sortedWorkerPools}
          pageSize={VIEW_WORKER_POOLS_PAGE_SIZE}
          headers={headers}
          sortByHeader={sortBy}
          sortDirection={sortDirection}
          loading={loading}
          page={page}
          hasNextPage={hasNextPage}
          hasPreviousPage={hasPreviousPage}
          onNextPage={onNextPage}
          onPreviousPage={onPreviousPage}
          onHeaderClick={this.handleHeaderClick}
          renderRow={this.renderRow}
          allowFilter
          filterFunc={(workerPool, filterValue) =>
            String(workerPool.workerPoolId).includes(filterValue) ||
            String(workerPool.providerId).includes(filterValue) ||
            String(workerPool.owner).includes(filterValue)
          }
        />
        <DialogAction
          open={open}
          onSubmit={this.handleDeleteClick}
          onClose={this.handleDialogActionClose}
          onError={this.handleDialogActionError}
          error={error}
          title={title}
          body={<Typography>{body}</Typography>}
          confirmText={confirmText}
        />
      </Fragment>
    );
  }
}
