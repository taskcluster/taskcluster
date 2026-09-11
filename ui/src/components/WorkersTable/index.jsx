import React, { Component, Fragment } from 'react';
import { arrayOf, bool, object, string } from 'prop-types';
import { parse, stringify } from 'qs';
import { withRouter } from 'react-router-dom';
import { formatDistanceStrict, parseISO } from 'date-fns';
import { withStyles } from '@material-ui/core/styles';
import { TableCell, TableRow, Typography } from '@material-ui/core';
import LinkIcon from 'mdi-react/LinkIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import { memoize } from '../../utils/memoize';
import Button from '../Button';
import CopyToClipboardTableCell from '../CopyToClipboardTableCell';
import StatusLabel from '../StatusLabel';
import DateDistance from '../DateDistance';
import TableCellItem from '../TableCellItem';
import PaginatedDataTable from '../PaginatedDataTable';
import Label from '../Label';
import DialogAction from '../DialogAction';
import { NULL_PROVIDER, VIEW_WORKERS_PAGE_SIZE } from '../../utils/constants';
import { pagination } from '../../utils/prop-types';
import { withAuth } from '../../utils/Auth';
import Link from '../../utils/Link';
import { removeWorker } from '../../utils/client';
import sort from '../../utils/sort';
import { enableTerminate, terminateDisabled } from '../../utils/terminate';

const iconSize = 16;

@withAuth
@withRouter
@withStyles(theme => ({
  linksIcon: {
    marginLeft: theme.spacing(1),
  },
  button: {
    marginLeft: -theme.spacing(2),
    marginRight: theme.spacing(1),
    borderRadius: 4,
  },
}))
/**
 * Display relevant information about workers in a table.
 */
export default class WorkersTable extends Component {
  static propTypes = {
    /** One page of workers from the worker-manager REST API. */
    workers: arrayOf(object).isRequired,
    loading: bool,
    /** Worker type name */
    workerType: string.isRequired,
    /** Provisioner identifier */
    provisionerId: string.isRequired,
    ...pagination,
  };

  static defaultProps = {
    loading: false,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  state = {
    error: null,
    open: false,
    title: '',
    body: '',
    confirmText: '',
    workerPoolId: '',
    workerGroup: '',
    workerId: '',
  };

  createSortedWorkers = memoize(
    (workers, sortBy, sortDirection) => {
      if (!sortBy) {
        return workers;
      }

      const direction = sortDirection === 'desc' ? -1 : 1;

      return [...workers].sort(
        (a, b) =>
          direction *
          sort(this.valueFromWorker(a, sortBy), this.valueFromWorker(b, sortBy))
      );
    },
    {
      // The run's state/started/resolved arrive asynchronously after
      // taskId/runId (see ViewWorkers' fetchLatestTaskRuns), so they must be
      // part of the cache key too -- otherwise this stays cached on the
      // pre-enrichment value and the table never picks up the update.
      serializer: ([workers, sortBy, sortDirection]) => {
        const ids = workers.map(
          ({ workerId, latestTask }) =>
            `${workerId}.${latestTask?.run?.taskId ?? '-'}.${
              latestTask?.run?.runId ?? '-'
            }.${latestTask?.run?.state ?? '-'}.${
              latestTask?.run?.started ?? '-'
            }.${latestTask?.run?.resolved ?? '-'}`
        );

        return `${ids.join('-')}-${sortBy}-${sortDirection}`;
      },
    }
  );

  handleDialogActionOpen = (workerPoolId, workerGroup, workerId) => () => {
    this.setState({
      open: true,
      title: 'Terminate Worker?',
      body: `This will terminate the worker with id ${workerId} in group ${workerGroup} within worker pool ${workerPoolId}.`,
      confirmText: 'Terminate Worker',
      workerPoolId,
      workerGroup,
      workerId,
    });
  };

  handleDeleteClick = async () => {
    const { workerPoolId, workerGroup, workerId } = this.state;
    const { user } = this.props;

    this.setState({
      error: null,
    });

    try {
      await removeWorker({ workerPoolId, workerGroup, workerId, user });
      this.setState({
        open: false,
      });
    } catch (error) {
      this.handleDialogActionError(error);
    }
  };

  handleDialogActionError = error => {
    this.setState({
      error,
    });
  };

  handleDialogActionClose = () => {
    this.setState({
      error: null,
      open: false,
    });
  };

  handleHeaderClick = sortByHeader => {
    const query = parse(this.props.location.search.slice(1));
    const sortBy = sortByHeader;
    const toggled = query.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = query.sortBy === sortBy ? toggled : 'desc';

    query.sortBy = sortBy;
    query.sortDirection = sortDirection;
    this.props.history.replace({
      search: stringify(query, { addQueryPrefix: true }),
    });
  };

  valueFromWorker(worker, sortBy) {
    const mapping = {
      'Worker Group': worker.workerGroup,
      'Worker ID': worker.workerId,
      'Worker State': worker.state,
      'Worker Capacity': worker.capacity,
      'Last Active': worker.lastDateActive,
      'First Claim': worker.firstClaim,
      'Most Recent Task': worker.latestTask?.run?.taskId,
      'Task State': worker.latestTask?.run?.state,
      'Task Started': worker.latestTask?.run?.started,
      'Task Resolved': worker.latestTask?.run?.resolved,
      Quarantined: worker.quarantineUntil,
    };

    return mapping[sortBy];
  }

  componentDidMount() {
    const query = parse(this.props.location.search.slice(1));

    if (query.sortBy) {
      return;
    }

    this.props.history.replace({
      search: stringify(
        { sortBy: 'Last Active', sortDirection: 'desc', ...query },
        { addQueryPrefix: true }
      ),
    });
  }

  render() {
    const query = parse(this.props.location.search.slice(1));
    const { sortBy, sortDirection } = query.sortBy
      ? query
      : { sortBy: 'Last Active', sortDirection: 'desc' };
    const {
      provisionerId,
      workerType,
      workers,
      loading,
      page,
      hasNextPage,
      hasPreviousPage,
      onNextPage,
      onPreviousPage,
      classes,
    } = this.props;
    const { open, error, title, confirmText, body } = this.state;
    const sortedWorkers = this.createSortedWorkers(
      workers,
      sortBy,
      sortDirection
    );

    return (
      <Fragment>
        <PaginatedDataTable
          items={sortedWorkers}
          pageSize={VIEW_WORKERS_PAGE_SIZE}
          page={page}
          loading={loading}
          hasNextPage={hasNextPage}
          hasPreviousPage={hasPreviousPage}
          onNextPage={onNextPage}
          onPreviousPage={onPreviousPage}
          sortByHeader={sortBy}
          sortDirection={sortDirection}
          onHeaderClick={this.handleHeaderClick}
          renderRow={(worker, style, key) => {
            const {
              workerId,
              workerGroup,
              latestTask,
              firstClaim,
              quarantineUntil,
              lastDateActive,
              state,
              capacity,
              providerId,
              workerPoolId,
            } = worker;

            return (
              <TableRow key={key ?? workerId} style={style}>
                <TableCell>{workerGroup}</TableCell>
                <TableCell>
                  <Link
                    to={`/provisioners/${provisionerId}/worker-types/${workerType}/workers/${workerGroup}/${workerId}`}>
                    <TableCellItem button>
                      {workerId}
                      <LinkIcon className={classes.linksIcon} size={iconSize} />
                    </TableCellItem>
                  </Link>
                </TableCell>
                <TableCell>
                  {state ? (
                    <StatusLabel state={state.toUpperCase()} />
                  ) : (
                    <em>n/a</em>
                  )}
                </TableCell>
                <TableCell> {capacity || 0} </TableCell>
                {lastDateActive ? (
                  <CopyToClipboardTableCell
                    tooltipTitle={lastDateActive}
                    textToCopy={lastDateActive}
                    text={<DateDistance from={lastDateActive} />}
                  />
                ) : (
                  <TableCell>
                    <em>n/a</em>
                  </TableCell>
                )}
                <CopyToClipboardTableCell
                  tooltipTitle={firstClaim}
                  textToCopy={firstClaim}
                  text={<DateDistance from={firstClaim} />}
                />
                <TableCell>
                  {latestTask?.run ? (
                    <Link
                      to={`/tasks/${latestTask.run.taskId}/runs/${latestTask.run.runId}`}>
                      <TableCellItem button>
                        {latestTask.run.taskId}
                        <LinkIcon
                          className={classes.linksIcon}
                          size={iconSize}
                        />
                      </TableCellItem>
                    </Link>
                  ) : (
                    <em>n/a</em>
                  )}
                </TableCell>
                <TableCell>
                  {latestTask?.run?.state ? (
                    <StatusLabel state={latestTask.run.state} />
                  ) : (
                    <em>n/a</em>
                  )}
                </TableCell>
                {latestTask?.run?.started ? (
                  <CopyToClipboardTableCell
                    tooltipTitle={latestTask.run.started}
                    textToCopy={latestTask.run.started}
                    text={<DateDistance from={latestTask.run.started} />}
                  />
                ) : (
                  <TableCell>n/a</TableCell>
                )}
                {latestTask?.run?.resolved ? (
                  <CopyToClipboardTableCell
                    tooltipTitle={latestTask.run.resolved}
                    textToCopy={latestTask.run.resolved}
                    text={<DateDistance from={latestTask.run.resolved} />}
                  />
                ) : (
                  <TableCell>n/a</TableCell>
                )}
                <TableCell>
                  {quarantineUntil &&
                  parseISO(quarantineUntil).getTime() > Date.now() ? (
                    formatDistanceStrict(
                      new Date(),
                      parseISO(quarantineUntil),
                      {
                        unit: 'day',
                      }
                    )
                  ) : (
                    <em>n/a</em>
                  )}
                </TableCell>
                <TableCell>
                  {providerId !== NULL_PROVIDER && enableTerminate(state) && (
                    <Button
                      requiresAuth
                      disabled={terminateDisabled(state, providerId)}
                      variant="outlined"
                      endIcon={<DeleteIcon size={iconSize} />}
                      onClick={this.handleDialogActionOpen(
                        workerPoolId,
                        workerGroup,
                        workerId
                      )}
                      tooltipProps={{ title: 'Terminate Worker' }}>
                      Terminate
                    </Button>
                  )}
                  {state === 'stopping' && (
                    <Label mini status="warning" className={classes.button}>
                      Scheduled for termination
                    </Label>
                  )}
                </TableCell>
              </TableRow>
            );
          }}
          headers={[
            'Worker Group',
            'Worker ID',
            'Worker State',
            'Worker Capacity',
            'Last Active',
            'First Claim',
            'Most Recent Task',
            'Task State',
            'Task Started',
            'Task Resolved',
            'Quarantined',
            '',
          ]}
        />
        {open && (
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
        )}
      </Fragment>
    );
  }
}
