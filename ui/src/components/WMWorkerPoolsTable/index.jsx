import React, { Component, Fragment } from 'react';
import { withStyles } from '@material-ui/core';
import classNames from 'classnames';
import { arrayOf, string, func } from 'prop-types';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import Typography from '@material-ui/core/Typography/';
import ListItemText from '@material-ui/core/ListItemText';
import IconButton from '@material-ui/core/IconButton';
import LinkIcon from 'mdi-react/LinkIcon';
import PencilIcon from 'mdi-react/PencilIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import { withRouter } from 'react-router-dom';
import memoize from 'fast-memoize';
import { camelCase } from 'change-case';
import { isEmpty, map, pipe, sort as rSort } from 'ramda';
import { WorkerManagerWorkerPoolSummary } from '../../utils/prop-types';
import DataTable from '../DataTable';
import sort from '../../utils/sort';
import Link from '../../utils/Link';
import TableCellListItem from '../TableCellListItem';
import ErrorPanel from '../ErrorPanel';
import formatError from '../../utils/formatError';

@withRouter
@withStyles(theme => ({
  button: {
    marginLeft: -theme.spacing.double,
    marginRight: theme.spacing.unit,
    borderRadius: 4,
  },
  deleteButton: {
    ...theme.mixins.errorIcon,
  },
  editButton: {
    ...theme.mixins.secondaryIcon,
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
        const ids = pipe(
          rSort((a, b) => sort(a.workerPool, b.workerPool)),
          map(({ workerPool }) => workerPool)
        )(workerPools);

        return `${ids.join('-')}-${sortBy}-${sortDirection}-${searchTerm}`;
      },
    }
  );

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  handleEditClick = ({ currentTarget: { name } }) => {
    this.props.history.push({
      pathname: `${this.props.match.path}/${encodeURIComponent(name)}/edit`,
      state: { hello: 'world' },
    });
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
          <IconButton
            className={classNames(classes.button, classes.editButton)}
            name={`${workerPool.workerPoolId}`}
            onClick={this.handleEditClick}>
            <PencilIcon size={iconSize} />
          </IconButton>
        </TableCell>

        <TableCell>
          <TableCellListItem
            button
            component={Link}
            to={`${path}/worker-pools/${workerPool.workerPoolId}`}>
            <ListItemText
              disableTypography
              primary={<Typography>{workerPool.workerPoolId}</Typography>}
            />
            <LinkIcon size={iconSize} />
          </TableCellListItem>
        </TableCell>

        <TableCell>
          <Typography>{workerPool.owner}</Typography>
        </TableCell>

        <TableCell>
          <Typography>{workerPool.description}</Typography>
        </TableCell>

        <TableCell>
          <Typography>{workerPool.pendingTasks}</Typography>
        </TableCell>

        <TableCell>
          <TableCellListItem
            button
            component={Link}
            to={`${path}/providers/${workerPool.providerId}`}>
            <ListItemText
              disableTypography
              primary={<Typography>{workerPool.providerId}</Typography>}
            />
            <LinkIcon size={iconSize} />
          </TableCellListItem>
        </TableCell>

        <TableCell>
          <IconButton
            className={classNames(classes.button, classes.deleteButton)}
            name={`${workerPool.workerPoolId}`}
            onClick={this.handleDeleteClick}
            disabled={actionLoading}>
            <DeleteIcon size={iconSize} />
          </IconButton>
        </TableCell>
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
            '',
            'Worker Pool ID',
            'Owner',
            'Description',
            'Pending Tasks',
            'Provider',
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
