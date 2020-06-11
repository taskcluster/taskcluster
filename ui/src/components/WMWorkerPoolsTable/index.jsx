import React, { Component, Fragment } from 'react';
import { withStyles } from '@material-ui/core';
import Label from '@mozilla-frontend-infra/components/Label';
import { shape, func, arrayOf, string } from 'prop-types';
import { pipe, map, sort as rSort } from 'ramda';
import { camelCase } from 'change-case/change-case';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import LinkIcon from 'mdi-react/LinkIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import WorkerIcon from 'mdi-react/WorkerIcon';
import MessageAlertIcon from 'mdi-react/MessageAlertIcon';
import { withRouter } from 'react-router-dom';
import memoize from 'fast-memoize';
import {
  WorkerManagerWorkerPoolSummary,
  pageInfo,
} from '../../utils/prop-types';
import ConnectionDataTable from '../ConnectionDataTable';
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

const sorted = pipe(
  rSort((a, b) => sort(a.node.workerPoolId, b.node.workerPoolId)),
  map(({ node: { workerPoolId } }) => workerPoolId)
);

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
}))
export default class WorkerManagerWorkerPoolsTable extends Component {
  static propTypes = {
    workerPoolsConnection: shape({
      edges: arrayOf(WorkerManagerWorkerPoolSummary),
      pageInfo,
    }).isRequired,
    deleteRequest: func.isRequired,
    searchTerm: string,
  };

  static defaultProps = {
    searchTerm: null,
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

  createSortedWorkerPoolsConnection = memoize(
    (workerPoolsConnection, sortBy, sortDirection) => {
      const sortByProperty = camelCase(sortBy);

      if (!sortBy) {
        return workerPoolsConnection;
      }

      return {
        ...workerPoolsConnection,
        edges: [...workerPoolsConnection.edges].sort((a, b) => {
          const firstElement =
            sortDirection === 'desc'
              ? b.node[sortByProperty]
              : a.node[sortByProperty];
          const secondElement =
            sortDirection === 'desc'
              ? a.node[sortByProperty]
              : b.node[sortByProperty];

          return sort(firstElement, secondElement);
        }),
      };
    },
    {
      serializer: ([workerPoolsConnection, sortBy, sortDirection]) => {
        const ids = sorted(workerPoolsConnection.edges);

        return `${ids.join('-')}-${sortBy}-${sortDirection}`;
      },
    }
  );

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

  renderRow = ({ node: workerPool }) => {
    const {
      match: { path },
      classes,
    } = this.props;
    const { actionLoading } = this.state;
    const iconSize = 16;
    const { provisionerId, workerType } = splitWorkerPoolId(
      workerPool.workerPoolId
    );

    return (
      <TableRow key={workerPool.workerPoolId}>
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

        <TableCell>{workerPool.currentCapacity}</TableCell>

        <TableCell>{workerPool.pendingTasks}</TableCell>

        <TableCell>{workerPool.owner}</TableCell>

        <TableCell>
          <Link
            to={`/provisioners/${encodeURIComponent(
              provisionerId
            )}/worker-types/${encodeURIComponent(workerType)}`}>
            <Button
              className={classes.linksButton}
              variant="outlined"
              disabled={actionLoading}
              size="small">
              <WorkerIcon className={classes.linksIcon} size={iconSize} />
              View Workers
            </Button>
          </Link>
          <Link
            to={`${path}/${encodeURIComponent(
              workerPool.workerPoolId
            )}/errors`}>
            <Button
              className={classes.linksButton}
              variant="outlined"
              disabled={actionLoading}
              size="small">
              <MessageAlertIcon className={classes.linksIcon} size={iconSize} />
              View Errors
            </Button>
          </Link>
          {workerPool.providerId !== NULL_PROVIDER ? (
            <IconButton
              title="Delete Worker Pool ID"
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
    const { onPageChange, workerPoolsConnection, searchTerm } = this.props;
    const {
      sortBy,
      sortDirection,
      dialogState: { open, error, title, confirmText, body },
    } = this.state;
    const sortedWorkerPoolsConnection = this.createSortedWorkerPoolsConnection(
      workerPoolsConnection,
      sortBy,
      sortDirection
    );
    const headers = [
      'Worker Pool ID',
      'Provider ID',
      'Current Capacity',
      'Pending Tasks',
      'Owner',
      '',
    ];

    return (
      <Fragment>
        <ConnectionDataTable
          searchTerm={searchTerm}
          connection={sortedWorkerPoolsConnection}
          pageSize={VIEW_WORKER_POOLS_PAGE_SIZE}
          headers={headers}
          sortByHeader={sortBy}
          sortDirection={sortDirection}
          onPageChange={onPageChange}
          onHeaderClick={this.handleHeaderClick}
          renderRow={this.renderRow}
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
