import React, { Component, Fragment } from 'react';
import { arrayOf, object } from 'prop-types';
import LinkIcon from 'mdi-react/LinkIcon';
import { withRouter } from 'react-router-dom';
import { withStyles } from '@material-ui/core/styles';
import { parse, stringify } from 'qs';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import IconButton from '@material-ui/core/IconButton';
import InformationVariantIcon from 'mdi-react/InformationVariantIcon';
import {
  Drawer,
  Typography,
  List,
  ListItem,
  ListItemText,
} from '@material-ui/core';
import TableCellItem from '../TableCellItem';
import Link from '../../utils/Link';
import DataTable from '../DataTable';
import StatusLabel from '../StatusLabel';
import DateDistance from '../DateDistance';
import sort from '../../utils/sort';
import Markdown from '../Markdown';
import { provisioner } from '../../utils/prop-types';

const COUNT_COLUMNS = ['pendingTasks', 'claimedTasks', 'workerTypeCount'];

@withRouter
@withStyles(theme => ({
  infoButton: {
    marginLeft: -theme.spacing(2),
    marginRight: theme.spacing(1),
    borderRadius: 4,
  },
  headline: {
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
  },
  metadataContainer: {
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(2),
    width: 400,
  },
}))
export default class ProvisionerDetailsTable extends Component {
  static propTypes = {
    provisioners: arrayOf(provisioner).isRequired,
    /**
     * Totals by provisionerId. undefined means the counts are still loading,
     * null that they failed.
     */
    counts: object,
  };

  state = {
    drawerOpen: false,
    drawerProvisioner: null,
  };

  sortProvisioners = (provisioners, sortBy, sortDirection) => {
    if (!sortBy) {
      return provisioners;
    }

    const sortValue = provisioner =>
      COUNT_COLUMNS.includes(sortBy)
        ? this.getCount(provisioner, sortBy)
        : provisioner[sortBy];

    return [...provisioners].sort((a, b) => {
      const firstElement =
        sortDirection === 'desc' ? sortValue(b) : sortValue(a);
      const secondElement =
        sortDirection === 'desc' ? sortValue(a) : sortValue(b);

      return sort(firstElement, secondElement);
    });
  };

  handleHeaderClick = ({ id: sortBy }) => {
    const query = parse(this.props.location.search.slice(1));
    const toggled = query.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = query.sortBy === sortBy ? toggled : 'desc';

    query.sortBy = sortBy;
    query.sortDirection = sortDirection;
    this.props.history.replace({
      search: stringify(query, { addQueryPrefix: true }),
    });
  };

  handleDrawerOpen = provisioner => {
    this.setState({
      drawerOpen: true,
      drawerProvisioner: provisioner,
    });
  };

  handleDrawerClose = () => {
    this.setState({
      drawerOpen: false,
    });
  };

  getCount = (provisioner, key) => {
    const { counts } = this.props;

    if (!counts) {
      return counts;
    }

    const totals = counts[provisioner.provisionerId];

    // A provisioner with no unexpired task queues has nothing to count.
    return totals ? totals[key] : 0;
  };

  renderCount = (provisioner, key) => {
    const count = this.getCount(provisioner, key);

    return count === undefined ? '' : (count ?? 'n/a');
  };

  renderTableRow = provisioner => {
    const iconSize = 16;
    const { classes } = this.props;

    return (
      <TableRow key={`${provisioner.provisionerId}`}>
        <TableCell>
          <IconButton
            className={classes.infoButton}
            name={provisioner.provisionerId}
            onClick={() => this.handleDrawerOpen(provisioner)}>
            <InformationVariantIcon size={iconSize} />
          </IconButton>
          <Link
            to={`/provisioners/${provisioner.provisionerId}`}
            title={`Explore worker types for ${provisioner.provisionerId}`}>
            <TableCellItem button>
              {provisioner.provisionerId}
              <LinkIcon size={iconSize} />
            </TableCellItem>
          </Link>
        </TableCell>
        <TableCell>
          <DateDistance from={provisioner.lastDateActive} />
        </TableCell>
        <TableCell>
          <DateDistance from={provisioner.expires} />
        </TableCell>
        <TableCell>
          <StatusLabel state={provisioner.stability} />
        </TableCell>
        {COUNT_COLUMNS.map(key => (
          <TableCell key={key}>{this.renderCount(provisioner, key)}</TableCell>
        ))}
      </TableRow>
    );
  };

  renderDrawerContent = () => {
    const { classes } = this.props;
    const { drawerProvisioner } = this.state;

    return (
      <div className={classes.metadataContainer}>
        <Typography variant="h5" className={classes.headline}>
          {drawerProvisioner?.provisionerId}
        </Typography>
        <List>
          <ListItem>
            <ListItemText
              primary="Description"
              secondary={
                drawerProvisioner?.description ? (
                  <Markdown>{drawerProvisioner.description}</Markdown>
                ) : (
                  'n/a'
                )
              }
            />
          </ListItem>
        </List>
      </div>
    );
  };

  render() {
    const { provisioners } = this.props;
    const query = parse(this.props.location.search.slice(1));
    const { drawerOpen } = this.state;
    const { sortBy, sortDirection } = query.sortBy
      ? query
      : { sortBy: null, sortDirection: null };
    const headers = [
      { label: 'Provisioner', id: 'provisionerId', type: 'string' },
      { label: 'Last Active', id: 'lastDateActive', type: 'string' },
      { label: 'Expires', id: 'expires', type: 'string' },
      { label: 'Stability', id: 'stability', type: 'string' },
      { label: 'Pending Tasks', id: 'pendingTasks', type: 'number' },
      { label: 'Claimed Tasks', id: 'claimedTasks', type: 'number' },
      { label: 'Worker Types', id: 'workerTypeCount', type: 'number' },
    ];

    const sortedProvisioners = this.sortProvisioners(
      provisioners,
      sortBy,
      sortDirection
    );

    return (
      <Fragment>
        <DataTable
          items={sortedProvisioners}
          sortByLabel={sortBy}
          sortDirection={sortDirection}
          onHeaderClick={this.handleHeaderClick}
          renderRow={this.renderTableRow}
          headers={headers}
        />
        <Drawer
          anchor="right"
          open={drawerOpen}
          onClose={this.handleDrawerClose}>
          {this.renderDrawerContent()}
        </Drawer>
      </Fragment>
    );
  }
}
