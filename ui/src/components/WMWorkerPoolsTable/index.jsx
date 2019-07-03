import React, { Component, Fragment } from 'react';
import { withStyles } from '@material-ui/core';
import Label from '@mozilla-frontend-infra/components/Label';
import { arrayOf, string, func } from 'prop-types';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import Typography from '@material-ui/core/Typography/';
import ListItemText from '@material-ui/core/ListItemText';
import IconButton from '@material-ui/core/IconButton';
import LinkIcon from 'mdi-react/LinkIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import WorkerIcon from 'mdi-react/WorkerIcon';
import { withRouter } from 'react-router-dom';
import memoize from 'fast-memoize';
import { camelCase } from 'change-case';
import { isEmpty } from 'ramda';
import { WorkerManagerWorkerPoolSummary } from '../../utils/prop-types';
import DataTable from '../DataTable';
import sort from '../../utils/sort';
import Link from '../../utils/Link';
import Button from '../Button';
import TableCellListItem from '../TableCellListItem';
import ErrorPanel from '../ErrorPanel';
import formatError from '../../utils/formatError';
import { NULL_PROVIDER } from '../../utils/constants';

@withRouter
@withStyles(theme => ({
  button: {
    marginLeft: -theme.spacing.double,
    marginRight: theme.spacing.unit,
    borderRadius: 4,
  },
  workerIcon: {
    marginRight: theme.spacing.unit,
  },
  viewWorkersButton: {
    marginRight: theme.spacing.triple,
  },
  lastTableCellRoot: {
    paddingLeft: theme.spacing.unit,
    paddingRight: theme.spacing.unit,
  },
}))
export default class WorkerManagerWorkerPoolsTable extends Component {
  static propTypes = {
    workerPools: arrayOf(WorkerManagerWorkerPoolSummary).isRequired,
    searchTerm: string,
    deleteRequest: func.isRequired,
  };

  state = {
    sortBy: null,
    sortDirection: null,
    error: null,
    actionLoading: false,
  };

  sortWorkerPools = memoize(
    (workerPools, sortBy, sortDirection, searchTerm) => {
      const sortByProperty = camelCase(sortBy);
      const filteredWorkerPools = searchTerm
        ? workerPools.filter(({ workerPool }) =>
            workerPool.includes(searchTerm)
          )
        : workerPools;

      return isEmpty(filteredWorkerPools)
        ? filteredWorkerPools
        : [...filteredWorkerPools].sort((a, b) => {
            const firstElement =
              sortDirection === 'desc' ? b[sortByProperty] : a[sortByProperty];
            const secondElement =
              sortDirection === 'desc' ? a[sortByProperty] : b[sortByProperty];

            return sort(firstElement, secondElement);
          });
    },
    {
      serializer: ([workerPools, sortBy, sortDirection, searchTerm]) => {
        // we serialize by workerPool ID - for workerpool addition
        // and by providerId - for workerpool deletion
        // (we delete them by changing provider)
        const ids = workerPools
          .map(wp => `${wp.workerPoolId}-${wp.providerId}`)
          .sort();

        return `${ids.join('-')}-${sortBy}-${sortDirection}-${searchTerm}`;
      },
    }
  );

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  handleDeleteClick = async ({ currentTarget: { name } }) => {
    const workerPool = this.props.workerPools.find(
      wp => wp.workerPoolId === name
    );
    const payload = {
      providerId: workerPool.providerId,
      description: workerPool.description,
      config: workerPool.config,
      owner: workerPool.owner,
      emailOnError: workerPool.emailOnError,
    };

    this.props.history.replace('/worker-manager');

    try {
      await this.props.deleteRequest({
        workerPoolId: workerPool.workerPoolId,
        payload,
      });
    } catch (error) {
      this.setState({ error: formatError(error), actionLoading: false });
    }
  };

  renderRow = workerPool => {
    const {
      match: { path },
      classes,
    } = this.props;
    const { actionLoading } = this.state;
    const iconSize = 16;

    return (
      <TableRow key={workerPool.workerPoolId}>
        <TableCell>
          <TableCellListItem
            button={workerPool.providerId !== NULL_PROVIDER}
            component={workerPool.providerId !== NULL_PROVIDER && Link}
            to={`${path}/${encodeURIComponent(workerPool.workerPoolId)}`}>
            <ListItemText
              disableTypography
              primary={<Typography>{workerPool.workerPoolId}</Typography>}
            />
            {workerPool.providerId !== NULL_PROVIDER && (
              <LinkIcon size={iconSize} />
            )}
          </TableCellListItem>
        </TableCell>

        <TableCell>
          <Typography>{workerPool.owner}</Typography>
        </TableCell>

        <TableCell>
          <Typography>{workerPool.pendingTasks}</Typography>
        </TableCell>

        <TableCell>
          {workerPool.providerId !== NULL_PROVIDER ? (
            <Typography>{workerPool.providerId}</Typography>
          ) : (
            <em>n/a</em>
          )}
        </TableCell>

        {workerPool.providerId !== NULL_PROVIDER ? (
          <TableCell classes={{ root: classes.lastTableCellRoot }}>
            <Fragment>
              <Button
                className={classes.viewWorkersButton}
                variant="outlined"
                component={Link}
                to={`${this.props.match.path}/${encodeURIComponent(
                  workerPool.workerPoolId
                )}/workers`}
                disabled={actionLoading}
                size="small">
                <WorkerIcon className={classes.workerIcon} size={iconSize} />
                View Workers
              </Button>
              <IconButton
                className={classes.button}
                name={`${workerPool.workerPoolId}`}
                onClick={this.handleDeleteClick}
                disabled={actionLoading}>
                <DeleteIcon size={iconSize} />
              </IconButton>
            </Fragment>
          </TableCell>
        ) : (
          <TableCell>
            <Label mini status="warning" className={classes.button}>
              Scheduled for deletion
            </Label>
          </TableCell>
        )}
      </TableRow>
    );
  };

  render() {
    const { workerPools, searchTerm } = this.props;
    const { sortBy, sortDirection, error } = this.state;
    const sortedWorkerPools = this.sortWorkerPools(
      workerPools,
      sortBy,
      sortDirection,
      searchTerm
    );

    return (
      <Fragment>
        {error && <ErrorPanel fixed error={error} />}
        <DataTable
          items={sortedWorkerPools}
          headers={[
            'Worker Pool ID',
            'Owner',
            'Pending Tasks',
            'Provider ID',
            '',
          ]}
          sortByHeader={sortBy}
          sortDirection={sortDirection}
          onHeaderClick={this.handleHeaderClick}
          renderRow={this.renderRow}
          padding="dense"
        />
      </Fragment>
    );
  }
}
