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
import { arrayOf, bool, object } from 'prop-types';
import { camelCase } from 'camel-case';
import LinkIcon from 'mdi-react/LinkIcon';
import CopyToClipboardTableCell from '../CopyToClipboardTableCell';
import StatusLabel from '../StatusLabel';
import DateDistance from '../DateDistance';
import Markdown from '../Markdown';
import TableCellItem from '../TableCellItem';
import PaginatedDataTable from '../PaginatedDataTable';
import { VIEW_WORKER_TYPES_PAGE_SIZE } from '../../utils/constants';
import { pagination } from '../../utils/prop-types';
import sort from '../../utils/sort';
import Link from '../../utils/Link';

const iconSize = 16;

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
    /** One page of worker types from the queue REST API. */
    workerTypes: arrayOf(object).isRequired,
    loading: bool,
    ...pagination,
  };

  static defaultProps = {
    loading: false,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  state = {
    sortBy: null,
    sortDirection: null,
    drawerOpen: false,
    drawerWorkerType: null,
  };

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  handleDrawerOpen = workerType => {
    this.setState({ drawerOpen: true, drawerWorkerType: workerType });
  };

  handleDrawerClose = () => {
    this.setState({ drawerOpen: false, drawerWorkerType: null });
  };

  render() {
    const {
      classes,
      workerTypes,
      loading,
      page,
      hasNextPage,
      hasPreviousPage,
      onNextPage,
      onPreviousPage,
    } = this.props;
    const { sortBy, sortDirection, drawerOpen, drawerWorkerType } = this.state;
    const sortByProperty = sortBy ? camelCase(sortBy) : null;
    const sortedWorkerTypes = sortByProperty
      ? [...workerTypes].sort((a, b) => {
          const firstElement =
            sortDirection === 'desc' ? b[sortByProperty] : a[sortByProperty];
          const secondElement =
            sortDirection === 'desc' ? a[sortByProperty] : b[sortByProperty];

          return sort(firstElement, secondElement);
        })
      : workerTypes;
    const headers = [
      'Worker Type',
      'Stability',
      'Last Date Active',
      'Pending Tasks',
    ];

    return (
      <Fragment>
        <PaginatedDataTable
          items={sortedWorkerTypes}
          pageSize={VIEW_WORKER_TYPES_PAGE_SIZE}
          page={page}
          loading={loading}
          hasNextPage={hasNextPage}
          hasPreviousPage={hasPreviousPage}
          onNextPage={onNextPage}
          onPreviousPage={onPreviousPage}
          sortByHeader={sortBy}
          sortDirection={sortDirection}
          onHeaderClick={this.handleHeaderClick}
          headers={headers}
          renderRow={(workerType, style, key) => (
            <TableRow key={key ?? workerType.workerType} style={style}>
              <TableCell>
                <IconButton
                  className={classes.infoButton}
                  name={workerType.workerType}
                  onClick={() => this.handleDrawerOpen(workerType)}>
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
              <TableCell>
                {workerType.pendingTasks === null
                  ? 'n/a'
                  : workerType.pendingTasks}
              </TableCell>
            </TableRow>
          )}
        />
        <Drawer
          anchor="right"
          open={drawerOpen}
          onClose={this.handleDrawerClose}>
          <div className={classes.metadataContainer}>
            <Typography variant="h5" className={classes.headline}>
              {drawerWorkerType?.workerType}
            </Typography>
            <List>
              <ListItem>
                <ListItemText
                  primary="Description"
                  secondary={
                    drawerWorkerType?.description ? (
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
