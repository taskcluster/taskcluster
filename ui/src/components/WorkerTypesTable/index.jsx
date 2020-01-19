import React, { Component, Fragment } from 'react';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import IconButton from '@material-ui/core/IconButton';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import Drawer from '@material-ui/core/Drawer';
import InformationVariantIcon from 'mdi-react/InformationVariantIcon';
import { func, array, shape } from 'prop-types';
import { pipe, map, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
import { camelCase } from 'change-case';
import LinkIcon from 'mdi-react/LinkIcon';
import CopyToClipboardTableCell from '../CopyToClipboardTableCell';
import StatusLabel from '../StatusLabel';
import DateDistance from '../DateDistance';
import Markdown from '../Markdown';
import TableCellItem from '../TableCellItem';
import ConnectionDataTable from '../ConnectionDataTable';
import { VIEW_WORKER_TYPES_PAGE_SIZE } from '../../utils/constants';
import sort from '../../utils/sort';
import Link from '../../utils/Link';
import { pageInfo } from '../../utils/prop-types';

const sorted = pipe(
  rSort((a, b) => sort(a.node.workerType, b.node.workerType)),
  map(
    ({ node: { provisionerId, workerType } }) =>
      `${provisionerId}.${workerType}`
  )
);

@withStyles(theme => ({
  infoButton: {
    marginLeft: -theme.spacing(2),
    marginRight: theme.spacing(1),
    borderRadius: 4,
  },
  headline: {
    paddingLeft: theme.spacing(3),
    paddingRight: theme.spacing(3),
  },
  metadataContainer: {
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(2),
    width: 400,
  },
}))
/**
 * Display relevant information about worker types in a table.
 */
export default class WorkerTypesTable extends Component {
  static propTypes = {
    /** Callback function fired when a page is changed. */
    onPageChange: func.isRequired,
    /** Worker Types GraphQL PageConnection instance. */
    workerTypesConnection: shape({
      edges: array,
      pageInfo,
    }).isRequired,
  };

  state = {
    sortBy: null,
    sortDirection: null,
    drawerOpen: false,
    drawerWorkerType: null,
  };

  createSortedWorkerTypesConnection = memoize(
    (workerTypesConnection, sortBy, sortDirection) => {
      const sortByProperty = camelCase(sortBy);

      if (!sortBy) {
        return workerTypesConnection;
      }

      return {
        ...workerTypesConnection,
        edges: [...workerTypesConnection.edges].sort((a, b) => {
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
      serializer: ([workerTypesConnection, sortBy, sortDirection]) => {
        const ids = sorted(workerTypesConnection.edges);

        return `${ids.join('-')}-${sortBy}-${sortDirection}`;
      },
    }
  );

  handleDrawerClose = () => {
    this.setState({
      drawerOpen: false,
      drawerWorkerType: null,
    });
  };

  handleDrawerOpen = ({ currentTarget: { name } }) =>
    memoize(
      name =>
        this.setState({
          drawerOpen: true,
          drawerWorkerType: this.workerTypes.edges.find(
            ({ node }) => node.workerType === name
          ).node,
        }),
      {
        serializer: name => name,
      }
    )(name);

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  render() {
    const { onPageChange, classes, workerTypesConnection } = this.props;
    const { sortBy, sortDirection, drawerOpen, drawerWorkerType } = this.state;

    this.workerTypes = this.createSortedWorkerTypesConnection(
      workerTypesConnection,
      sortBy,
      sortDirection
    );
    const headers = [
      'Worker Type',
      'Stability',
      'Last Date Active',
      'Pending Tasks',
    ];
    const iconSize = 16;

    if (this.workerTypes.edges.length) {
      if ('runningCapacity' in this.workerTypes.edges[0].node) {
        headers.push('Running Capacity');
      }

      if ('pendingCapacity' in this.workerTypes.edges[0].node) {
        headers.push('Pending Capacity');
      }
    }

    return (
      <Fragment>
        <ConnectionDataTable
          connection={this.workerTypes}
          pageSize={VIEW_WORKER_TYPES_PAGE_SIZE}
          sortByHeader={sortBy}
          sortDirection={sortDirection}
          onHeaderClick={this.handleHeaderClick}
          onPageChange={onPageChange}
          headers={headers}
          renderRow={({ node: workerType }) => (
            <TableRow key={workerType.workerType}>
              <TableCell>
                <IconButton
                  className={classes.infoButton}
                  name={workerType.workerType}
                  onClick={this.handleDrawerOpen}>
                  <InformationVariantIcon size={iconSize} />
                </IconButton>
                <Link
                  to={`/provisioners/${workerType.provisionerId}/worker-types/${workerType.workerType}`}>
                  <TableCellItem button>
                    {workerType.workerType}
                    <LinkIcon size={iconSize} />
                  </TableCellItem>
                </Link>
              </TableCell>
              <TableCell>
                <StatusLabel state={workerType.stability} />
              </TableCell>
              <CopyToClipboardTableCell
                tooltipTitle={workerType.lastDateActive}
                textToCopy={workerType.lastDateActive}
                text={<DateDistance from={workerType.lastDateActive} />}
              />
              <TableCell>{workerType.pendingTasks}</TableCell>
              {'runningCapacity' in workerType && (
                <TableCell>{workerType.runningCapacity}</TableCell>
              )}
              {'pendingCapacity' in workerType && (
                <TableCell>{workerType.pendingCapacity}</TableCell>
              )}
            </TableRow>
          )}
        />
        <Drawer
          anchor="right"
          open={drawerOpen}
          onClose={this.handleDrawerClose}>
          <div className={classes.metadataContainer}>
            <Typography variant="h5" className={classes.headline}>
              {drawerWorkerType && drawerWorkerType.workerType}
            </Typography>
            <List>
              <ListItem>
                <ListItemText
                  primary="Description"
                  secondary={
                    drawerWorkerType && drawerWorkerType.description ? (
                      <Markdown>{drawerWorkerType.description}</Markdown>
                    ) : (
                      'n/a'
                    )
                  }
                />
              </ListItem>
            </List>
          </div>
        </Drawer>
      </Fragment>
    );
  }
}
