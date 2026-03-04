import React, { Component, Fragment } from 'react';
import { isEmpty, map, pipe, sort as rSort } from 'ramda';
import { withStyles } from '@material-ui/core/styles';
import { camelCase } from 'camel-case';
import { shape, arrayOf, string, func } from 'prop-types';
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
import ConnectionDataTable from '../ConnectionDataTable';
import { VIEW_WORKER_POOL_ERRORS_PAGE_SIZE } from '../../utils/constants';
import TableCellItem from '../TableCellItem';
import DateDistance from '../DateDistance';
import sort from '../../utils/sort';
import { pageInfo, WMError } from '../../utils/prop-types';
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
    onPageChange: func.isRequired,
    searchTerm: string,
    workerPoolId: string,
    errorsConnection: shape({
      edges: arrayOf(shape({ node: WMError.isRequred }).isRequired).isRequired,
      pageInfo: pageInfo.isRequired,
    }).isRequired,
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
    (errorsConnection, sortBy, sortDirection, searchTerm) => {
      const sortByProperty = sortBy ? camelCase(sortBy) : '';
      // filter
      const filtered = {
        ...errorsConnection,
        edges: searchTerm
          ? errorsConnection.edges.filter(
              ({ node: { title, description, errorId } }) =>
                title.includes(searchTerm) ||
                description.includes(searchTerm) ||
                errorId.includes(searchTerm)
            )
          : errorsConnection.edges,
      };

      // sort
      return {
        ...filtered,
        edges: isEmpty(filtered.edges)
          ? filtered.edges
          : [...filtered.edges].sort((a, b) => {
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
      serializer: ([errorsConnection, sortBy, sortDirection, searchTerm]) => {
        const ids = pipe(
          rSort((a, b) => sort(a.node.errorId, b.node.errorId)),
          map(({ node: { errorId } }) => errorId)
        )(errorsConnection.edges);

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
    const { errorsConnection } = this.props;
    const drawerError = errorsConnection.edges.find(
      ({ node }) => node.errorId === name
    ).node;

    this.setState({
      drawerError,
    });
  }

  renderTableRow = error => {
    const { classes, workerPoolId } = this.props;
    const {
      errorId,
      title,
      description,
      reported,
      launchConfigId,
    } = error.node;

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
    const { classes, errorsConnection, searchTerm, onPageChange } = this.props;
    const { sortBy, sortDirection, drawerError } = this.state;
    const sortedErrors = this.sortErrors(
      errorsConnection,
      sortBy,
      sortDirection,
      searchTerm
    );

    return (
      <Fragment>
        <ConnectionDataTable
          connection={sortedErrors}
          pageSize={VIEW_WORKER_POOL_ERRORS_PAGE_SIZE}
          sortByHeader={sortBy}
          sortDirection={sortDirection}
          onHeaderClick={this.handleHeaderClick}
          renderRow={this.renderTableRow}
          headers={['Title', 'Description', 'Launch Config', 'Reported']}
          onPageChange={onPageChange}
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
