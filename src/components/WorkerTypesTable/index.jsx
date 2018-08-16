import { Component, Fragment } from 'react';
import { Link } from 'react-router-dom';
import Markdown from '@mozilla-frontend-infra/components/Markdown';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import Drawer from '@material-ui/core/Drawer';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import InformationVariantIcon from 'mdi-react/InformationVariantIcon';
import { string, func, array, shape, arrayOf } from 'prop-types';
import { memoizeWith, pipe, map, sort as rSort } from 'ramda';
import { camelCase } from 'change-case';
import LinkIcon from 'mdi-react/LinkIcon';
import Button from '../Button';
import StatusLabel from '../StatusLabel';
import DateDistance from '../DateDistance';
import TableCellListItem from '../TableCellListItem';
import ConnectionDataTable from '../ConnectionDataTable';
import { VIEW_WORKER_TYPES_PAGE_SIZE } from '../../utils/constants';
import sort from '../../utils/sort';
import normalizeWorkerTypes from '../../utils/normalizeWorkerTypes';
import {
  pageInfo,
  awsProvisionerWorkerTypeSummary,
} from '../../utils/prop-types';

const sorted = pipe(
  rSort((a, b) => sort(a.node.workerType, b.node.workerType)),
  map(
    ({ node: { provisionerId, workerType } }) =>
      `${provisionerId}.${workerType}`
  )
);

@withStyles(theme => ({
  infoButton: {
    marginLeft: -theme.spacing.double,
    marginRight: theme.spacing.unit,
  },
  headline: {
    paddingLeft: theme.spacing.triple,
    paddingRight: theme.spacing.triple,
  },
  metadataContainer: {
    paddingTop: theme.spacing.double,
    paddingBottom: theme.spacing.double,
    width: 400,
  },
}))
/**
 * Display relevant information about worker types in a table.
 */
export default class WorkerTypesTable extends Component {
  workerTypes = null;

  static propTypes = {
    /** Provisioner identifier */
    provisionerId: string.isRequired,
    /** Callback function fired when a page is changed. */
    onPageChange: func.isRequired,
    /** Worker Types GraphQL PageConnection instance. */
    workerTypesConnection: shape({
      edges: array,
      pageInfo,
    }).isRequired,
    /**
     * AWS worker-type summaries.
     * Required when `provisionerId === 'aws-provisioner-v1'`.
     */
    awsProvisionerWorkerTypeSummaries: arrayOf(awsProvisionerWorkerTypeSummary),
  };

  static defaultProps = {
    awsProvisionerWorkerTypeSummaries: null,
  };

  state = {
    sortBy: null,
    sortDirection: null,
    drawerOpen: false,
    drawerWorkerType: null,
  };

  handleDrawerClose = () => {
    this.setState({
      drawerOpen: false,
      drawerWorkerType: null,
    });
  };

  handleDrawerOpen = ({ target: { name } }) =>
    memoizeWith(
      name => name,
      name =>
        this.setState({
          drawerOpen: true,
          drawerWorkerType: this.workerTypes.edges.find(
            ({ node }) => node.workerType === name
          ).node,
        })
    )(name);

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  createSortedWorkerTypesConnection = memoizeWith(
    (
      workerTypesConnection,
      awsProvisionerWorkerTypeSummaries,
      sortBy,
      sortDirection
    ) => {
      const ids = sorted(workerTypesConnection.edges);

      return `${ids.join('-')}-${sortBy}-${sortDirection}`;
    },
    (
      workerTypesConnection,
      awsProvisionerWorkerTypeSummaries,
      sortBy,
      sortDirection
    ) => {
      const sortByProperty = camelCase(sortBy);
      // Normalize worker types for aws-provisioner-v1
      const workerTypes = normalizeWorkerTypes(
        workerTypesConnection,
        awsProvisionerWorkerTypeSummaries
      );

      if (!sortBy) {
        return workerTypes;
      }

      return {
        ...workerTypes,
        edges: [...workerTypes.edges].sort((a, b) => {
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
    }
  );

  render() {
    const {
      onPageChange,
      classes,
      workerTypesConnection,
      awsProvisionerWorkerTypeSummaries,
    } = this.props;
    const { sortBy, sortDirection, drawerOpen, drawerWorkerType } = this.state;

    this.workerTypes = this.createSortedWorkerTypesConnection(
      workerTypesConnection,
      awsProvisionerWorkerTypeSummaries,
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
                <Button
                  className={classes.infoButton}
                  size="small"
                  name={workerType.workerType}
                  onClick={this.handleDrawerOpen}>
                  <InformationVariantIcon size={iconSize} />
                </Button>
                <TableCellListItem
                  button
                  component={Link}
                  to={`/provisioners/${workerType.provisionerId}/worker-types/${
                    workerType.workerType
                  }`}>
                  <ListItemText
                    disableTypography
                    primary={
                      <Typography variant="body1">
                        {workerType.workerType}
                      </Typography>
                    }
                  />
                  <LinkIcon size={iconSize} />
                </TableCellListItem>
              </TableCell>
              <TableCell>
                <StatusLabel state={workerType.stability} />
              </TableCell>
              <TableCell>
                <TableCellListItem button>
                  <ListItemText
                    disableTypography
                    primary={
                      <Typography variant="body1">
                        <DateDistance from={workerType.lastDateActive} />
                      </Typography>
                    }
                  />
                  <ContentCopyIcon size={iconSize} />
                </TableCellListItem>
              </TableCell>
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
            <Typography variant="headline" className={classes.headline}>
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
