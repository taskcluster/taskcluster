import React, { Component, Fragment } from 'react';
import { isEmpty, map, pipe, sort as rSort } from 'ramda';
import { withStyles } from '@material-ui/core/styles';
import { camelCase } from 'camel-case';
import { arrayOf, string, func, number, bool } from 'prop-types';
import IconButton from '@material-ui/core/IconButton';
import CloseIcon from 'mdi-react/CloseIcon';
import TableRow from '@material-ui/core/TableRow';
import Drawer from '@material-ui/core/Drawer';
import TableCell from '@material-ui/core/TableCell';
import List from '@material-ui/core/List';
import ListItemText from '@material-ui/core/ListItemText';
import ListItem from '@material-ui/core/ListItem';
import Typography from '@material-ui/core/Typography';
import LinkIcon from 'mdi-react/LinkIcon';
import { memoize } from '../../utils/memoize';
import JsonDisplay from '../JsonDisplay';
import CopyToClipboardTableCell from '../CopyToClipboardTableCell';
import PaginatedDataTable from '../PaginatedDataTable';
import { VIEW_WORKER_POOL_ERRORS_PAGE_SIZE } from '../../utils/constants';
import TableCellItem from '../TableCellItem';
import DateDistance from '../DateDistance';
import sort from '../../utils/sort';
import { WMError } from '../../utils/prop-types';
import Link from '../../utils/Link';

@withStyles(theme => ({
  errorDescription: {
    marginRight: theme.spacing(1),
    maxWidth: '55vw',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    verticalAlign: 'middle',
    display: 'inline-block',
  },
  infoButton: {
    marginLeft: -theme.spacing(2),
    marginRight: theme.spacing(1),
    borderRadius: 4,
  },
  headline: {
    paddingLeft: theme.spacing(3),
    paddingRight: theme.spacing(3),
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    maxWidth: '80vw',
    whiteSpace: 'nowrap',
  },
  metadataContainer: {
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(2),
    width: 400,
  },
  drawerPaper: {
    width: '40vw',
    [theme.breakpoints.down('sm')]: {
      width: '90vw',
    },
  },
  drawerCloseIcon: {
    position: 'absolute',
    top: theme.spacing(1),
    right: theme.spacing(1),
  },
}))
export default class WorkerManagerErrorsTable extends Component {
  static propTypes = {
    items: arrayOf(WMError).isRequired,
    page: number.isRequired,
    loading: bool,
    hasNextPage: bool,
    hasPreviousPage: bool,
    onNextPage: func.isRequired,
    onPreviousPage: func.isRequired,
    searchTerm: string,
    workerPoolId: string,
  };

  static defaultProps = {
    searchTerm: '',
  };

  state = {
    sortBy: 'Reported',
    sortDirection: 'desc',
    drawerError: null,
  };

  sortErrors = memoize(
    (items, sortBy, sortDirection, searchTerm) => {
      const sortByProperty = sortBy ? camelCase(sortBy) : '';
      const filtered = searchTerm
        ? items.filter(
            ({ title, description, errorId }) =>
              title.includes(searchTerm) ||
              description.includes(searchTerm) ||
              errorId.includes(searchTerm)
          )
        : items;

      return isEmpty(filtered)
        ? filtered
        : [...filtered].sort((a, b) => {
            const firstElement =
              sortDirection === 'desc' ? b[sortByProperty] : a[sortByProperty];
            const secondElement =
              sortDirection === 'desc' ? a[sortByProperty] : b[sortByProperty];

            return sort(firstElement, secondElement);
          });
    },
    {
      serializer: ([items, sortBy, sortDirection, searchTerm]) => {
        const ids = pipe(
          rSort((a, b) => sort(a.errorId, b.errorId)),
          map(({ errorId }) => errorId)
        )(items);

        return `${ids.join('-')}-${sortBy}-${sortDirection}-${searchTerm}`;
      },
    }
  );

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  handleDrawerClose = () => {
    this.setState({
      drawerError: null,
    });
  };

  handleDrawerOpen(name) {
    const { items } = this.props;
    const drawerError = items.find(({ errorId }) => errorId === name);

    this.setState({
      drawerError,
    });
  }

  renderTableRow = error => {
    const { classes, workerPoolId } = this.props;
    const { errorId, title, description, reported, launchConfigId } = error;

    return (
      <TableRow key={errorId}>
        <TableCell
          style={{ cursor: 'pointer' }}
          onClick={() => this.handleDrawerOpen(errorId)}>
          <TableCellItem>
            <ListItemText disableTypography primary={title} />
          </TableCellItem>
        </TableCell>
        <TableCell
          style={{ cursor: 'pointer' }}
          onClick={() => this.handleDrawerOpen(errorId)}>
          <Typography
            variant="body2"
            className={classes.errorDescription}
            title={description}>
            {description}
          </Typography>
        </TableCell>
        <TableCell>
          {launchConfigId && (
            <Link
              to={`/worker-manager/${encodeURIComponent(
                workerPoolId
              )}/launch-configs?launchConfigId=${encodeURIComponent(
                launchConfigId
              )}&includeArchived=true`}>
              <TableCellItem>
                {launchConfigId ?? 'n/a'}
                <LinkIcon size={16} style={{ marginLeft: 2 }} />
              </TableCellItem>
            </Link>
          )}
          {!launchConfigId && <TableCellItem>n/a</TableCellItem>}
        </TableCell>

        <CopyToClipboardTableCell
          tooltipTitle={reported}
          textToCopy={reported}
          text={
            <Typography variant="body2">
              <DateDistance from={reported} />
            </Typography>
          }
        />
      </TableRow>
    );
  };

  render() {
    const {
      classes,
      items,
      searchTerm,
      page,
      loading,
      hasNextPage,
      hasPreviousPage,
      onNextPage,
      onPreviousPage,
    } = this.props;
    const { sortBy, sortDirection, drawerError } = this.state;
    const sortedErrors = this.sortErrors(
      items,
      sortBy,
      sortDirection,
      searchTerm
    );

    return (
      <Fragment>
        <PaginatedDataTable
          items={sortedErrors}
          pageSize={VIEW_WORKER_POOL_ERRORS_PAGE_SIZE}
          sortByHeader={sortBy}
          sortDirection={sortDirection}
          onHeaderClick={this.handleHeaderClick}
          renderRow={this.renderTableRow}
          headers={['Title', 'Description', 'Launch Config', 'Reported']}
          page={page}
          loading={loading}
          hasNextPage={hasNextPage}
          hasPreviousPage={hasPreviousPage}
          onNextPage={onNextPage}
          onPreviousPage={onPreviousPage}
        />
        <Drawer
          anchor="right"
          open={Boolean(drawerError)}
          onClose={this.handleDrawerClose}
          classes={{ paper: classes.drawerPaper }}>
          {drawerError && (
            <Fragment>
              <IconButton
                onClick={this.handleDrawerClose}
                className={classes.drawerCloseIcon}>
                <CloseIcon />
              </IconButton>
              <div className={classes.metadataContainer}>
                <Typography
                  variant="h5"
                  className={classes.headline}
                  title={drawerError.errorId}>
                  {drawerError.errorId}
                </Typography>
                <List>
                  <ListItem>
                    <ListItemText
                      primary="Title"
                      secondary={drawerError.title}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Description"
                      secondary={drawerError.description}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Reported"
                      secondary={drawerError.reported}
                    />
                  </ListItem>
                  {drawerError.launchConfigId && (
                    <ListItem>
                      <ListItemText
                        primary="Launch Config ID"
                        secondary={drawerError.launchConfigId}
                      />
                    </ListItem>
                  )}
                  <ListItem>
                    <ListItemText
                      primary="Extra"
                      secondaryTypographyProps={{
                        component: 'div',
                      }}
                      secondary={
                        <JsonDisplay
                          syntax="json"
                          objectContent={drawerError.extra}
                        />
                      }
                    />
                  </ListItem>
                </List>
              </div>
            </Fragment>
          )}
        </Drawer>
      </Fragment>
    );
  }
}
