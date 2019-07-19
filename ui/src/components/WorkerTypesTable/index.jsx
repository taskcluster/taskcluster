import React, { Component, Fragment } from 'react';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import IconButton from '@material-ui/core/IconButton';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import Drawer from '@material-ui/core/Drawer';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import InformationVariantIcon from 'mdi-react/InformationVariantIcon';
import { func, array, shape, arrayOf } from 'prop-types';
import { pipe, map, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
import { camelCase } from 'change-case';
import LinkIcon from 'mdi-react/LinkIcon';
import StatusLabel from '../StatusLabel';
import DateDistance from '../DateDistance';
import Markdown from '../Markdown';
import InheritMaterialUI from '../InheritMaterialUI';
import ConnectionDataTable from '../ConnectionDataTable';
import { VIEW_WORKER_TYPES_PAGE_SIZE } from '../../utils/constants';
import sort from '../../utils/sort';
import Link from '../../utils/Link';
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
    borderRadius: 4,
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
  static defaultProps = {
    awsProvisionerWorkerTypeSummaries: null,
  };

  static propTypes = {
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

  state = {
    sortBy: null,
    sortDirection: null,
    drawerOpen: false,
    drawerWorkerType: null,
  };

  createSortedWorkerTypesConnection = memoize(
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
    },
    {
      serializer: ([
        workerTypesConnection,
        // eslint-disable-next-line no-unused-vars
        awsProvisionerWorkerTypeSummaries,
        sortBy,
        sortDirection,
      ]) => {
        const ids = sorted(workerTypesConnection.edges);

        return `${ids.join('-')}-${sortBy}-${sortDirection}`;
      },
    }
  );

  workerTypes = null;

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
                <IconButton
                  className={classes.infoButton}
                  name={workerType.workerType}
                  onClick={this.handleDrawerOpen}>
                  <InformationVariantIcon size={iconSize} />
                </IconButton>
                <InheritMaterialUI
                  button
                  component={Link}
                  to={`/provisioners/${workerType.provisionerId}/worker-types/${
                    workerType.workerType
                  }`}>
                  <ListItemText
                    disableTypography
                    primary={<Typography>{workerType.workerType}</Typography>}
                  />
                  <LinkIcon size={iconSize} />
                </InheritMaterialUI>
              </TableCell>
              <TableCell>
                <StatusLabel state={workerType.stability} />
              </TableCell>
              <CopyToClipboard
                title={`${workerType.lastDateActive} (Copy)`}
                text={workerType.lastDateActive}>
                <TableCell>
                  <InheritMaterialUI>
                    <ListItemText
                      disableTypography
                      primary={
                        <Typography>
                          <DateDistance from={workerType.lastDateActive} />
                        </Typography>
                      }
                    />
                    <ContentCopyIcon size={iconSize} />
                  </InheritMaterialUI>
                </TableCell>
              </CopyToClipboard>
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
