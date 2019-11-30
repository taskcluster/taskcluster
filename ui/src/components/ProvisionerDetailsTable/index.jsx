import React, { Component, Fragment } from 'react';
import LinkIcon from 'mdi-react/LinkIcon';
import { withRouter } from 'react-router-dom';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import IconButton from '@material-ui/core/IconButton';
import InformationVariantIcon from 'mdi-react/InformationVariantIcon';
import TableCellItem from '../TableCellItem';
import Link from '../../utils/Link';
import { withAuth } from '../../utils/Auth';
import DataTable from '../DataTable';
import StatusLabel from '../StatusLabel';
import DateDistance from '../DateDistance';
import sort from '../../utils/sort';

@withRouter
@withAuth
@withStyles(theme => ({
  infoButton: {
    marginLeft: -theme.spacing(2),
    marginRight: theme.spacing(1),
    borderRadius: 4,
  }
}))
export default class ProvisionerDetailsTable extends Component {
  state = {
    sortBy: null,
    sortDirection: null,
  };

  sortProvisioners = (provisioners, sortBy, sortDirection) => {
    if (!sortBy) {
      return provisioners;
    }

    return provisioners.sort((a, b) => {
      const firstElement =
        sortDirection === 'desc' ? b.node[sortBy] : a.node[sortBy];
      const secondElement =
        sortDirection === 'desc' ? a.node[sortBy] : b.node[sortBy];

      return sort(firstElement, secondElement);
    });
  };

  handleHeaderClick = ({ id: sortBy }) => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  renderTableRow = ({ node: provisioner }) => {
    const iconSize = 16;
    const { classes } = this.props;

    return (
      <TableRow key={`${provisioner.provisionerId}-item`}>
        <TableCell>
          <IconButton
            className={classes.infoButton}
            name={provisioner.provisionerId}
            onClick={this.handleDrawerOpen}>
            <InformationVariantIcon size={iconSize} />
          </IconButton>
          <Link to={`/provisioners/${provisioner.provisionerId}`} title={`Explore worker types for ${provisioner.provisionerId}`}>
            <TableCellItem button>
              {provisioner.provisionerId}
              <LinkIcon size={iconSize} />
            </TableCellItem>
          </Link>
        </TableCell>
        <TableCell>
          <StatusLabel state={provisioner.stability} />
        </TableCell>
        <TableCell>
          <DateDistance from={provisioner.lastDateActive} />
        </TableCell>
        <TableCell>
          <DateDistance from={provisioner.expires} />
        </TableCell>
      </TableRow>
    );
  };

  render() {
    const { provisioners } = this.props;
    const { sortBy, sortDirection } = this.state;
    const headers = [
      { label: 'Provisioner', id: 'provisionerId', type: 'string' },
      { label: 'Stability', id: 'stability', type: 'string' },
      { label: 'Last Active', id: 'lastDateActive', type: 'string' },
      { label: 'Expires', id: 'expires', type: 'string' },
    ];

    this.sortProvisioners(provisioners, sortBy, sortDirection);

    return (
      <Fragment>
        <DataTable
          items={provisioners}
          sortByLabel={sortBy}
          sortDirection={sortDirection}
          onHeaderClick={this.handleHeaderClick}
          renderRow={this.renderTableRow}
          headers={headers}
        />
      </Fragment>
    );
  }
}
