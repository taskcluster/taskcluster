import React, { Component, Fragment } from 'react';
import { isEmpty, map, pipe, sort as rSort } from 'ramda';
import { withStyles } from '@material-ui/core/styles';
import { camelCase } from 'change-case';
import memoize from 'fast-memoize';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { shape, arrayOf, string, func } from 'prop-types';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import IconButton from '@material-ui/core/IconButton';
import CloseIcon from 'mdi-react/CloseIcon';
import InformationVariantIcon from 'mdi-react/InformationVariantIcon';
import TableRow from '@material-ui/core/TableRow/TableRow';
import Drawer from '@material-ui/core/Drawer';
import TableCell from '@material-ui/core/TableCell/TableCell';
import Code from '@mozilla-frontend-infra/components/Code';
import List from '@material-ui/core/List';
import ListItemText from '@material-ui/core/ListItemText/ListItemText';
import ListItem from '@material-ui/core/ListItem';
import Typography from '@material-ui/core/Typography/Typography';
import ConnectionDataTable from '../ConnectionDataTable';
import { VIEW_WORKER_POOL_ERRORS_PAGE_SIZE } from '../../utils/constants';
import TableCellItem from '../TableCellItem';
import DateDistance from '../DateDistance';
import sort from '../../utils/sort';
import { pageInfo, WMError } from '../../utils/prop-types';

const tableHeaders = [
  { label: 'Title', id: 'title', type: 'string' },
  { label: 'Description', id: 'description', type: 'string' },
  { label: 'Reported', id: 'reported', type: 'string' },
];

@withStyles(theme => ({
  errorDescription: {
    marginRight: theme.spacing.unit,
    maxWidth: '55vw',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    verticalAlign: 'middle',
    display: 'inline-block',
  },
  infoButton: {
    marginLeft: -theme.spacing.double,
    marginRight: theme.spacing.unit,
    borderRadius: 4,
  },
  headline: {
    paddingLeft: theme.spacing.triple,
    paddingRight: theme.spacing.triple,
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    maxWidth: '80vw',
    whiteSpace: 'nowrap',
  },
  metadataContainer: {
    paddingTop: theme.spacing.double,
    paddingBottom: theme.spacing.double,
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
    top: theme.spacing.unit,
    right: theme.spacing.unit,
  },
}))
export default class WorkerManagerErrorsTable extends Component {
  static propTypes = {
    onPageChange: func.isRequired,
    searchTerm: string,
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
      const sortByProperty = camelCase(sortBy);
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

  handleDrawerOpen = ({ currentTarget: { name } }) => {
    const { errorsConnection } = this.props;
    const drawerError = errorsConnection.edges.find(
      ({ node }) => node.errorId === name
    ).node;

    this.setState({
      drawerError,
    });
  };

  renderTableRow = error => {
    const { classes } = this.props;
    const { errorId, title, description, reported } = error.node;
    const iconSize = 16;

    return (
      <TableRow key={errorId}>
        <TableCell>
          <TableCellItem>
            <ListItemText disableTypography primary={title} />
          </TableCellItem>
        </TableCell>
        <TableCell>
          <IconButton
            className={classes.infoButton}
            name={errorId}
            onClick={this.handleDrawerOpen}>
            <InformationVariantIcon size={iconSize} />
          </IconButton>
          <Typography className={classes.errorDescription} title={description}>
            {description}
          </Typography>
        </TableCell>

        <CopyToClipboard title={`${reported} (Copy)`} text={reported}>
          <TableCell>
            <TableCellItem button>
              <ListItemText
                disableTypography
                primary={
                  <Typography>
                    <DateDistance from={reported} />
                  </Typography>
                }
              />
              <ContentCopyIcon size={iconSize} />
            </TableCellItem>
          </TableCell>
        </CopyToClipboard>
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
          headers={tableHeaders}
          padding="dense"
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
                  <ListItem>
                    <ListItemText
                      primary="Extra"
                      secondaryTypographyProps={{
                        component: 'div',
                      }}
                      secondary={
                        <Code language="json">
                          {JSON.stringify(drawerError.extra, null, 2)}
                        </Code>
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
