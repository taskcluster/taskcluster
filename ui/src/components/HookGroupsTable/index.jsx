import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { isEmpty } from 'ramda';
import { any, arrayOf, string } from 'prop-types';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import DataTable from '../DataTable';
import Link from '../../utils/Link';
import sort from '../../utils/sort';

@withRouter
export default class HookGroupsTable extends Component {
  static propTypes = {
    searchTerm: string,
    hookGroups: arrayOf(string).isRequired,
    classes: any,
  };

  static defaultProps = {
    searchTerm: '',
  };

  state = {
    sortBy: null,
    sortDirection: null,
  };

  handleHeaderClick = header => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === header.id ? toggled : 'desc';

    this.setState({ sortBy: header.id, sortDirection });
  };

  get sortedHookGroups() {
    const { hookGroups, searchTerm } = this.props;
    const { sortBy, sortDirection } = this.state;
    const filteredGroups = searchTerm
      ? hookGroups.filter(hookGroup =>
          hookGroup.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : hookGroups;

    return isEmpty(filteredGroups) || !sortBy
      ? filteredGroups
      : [...filteredGroups].sort((a, b) => {
          const firstElement = sortDirection === 'desc' ? b : a;
          const secondElement = sortDirection === 'desc' ? a : b;

          return sort(firstElement, secondElement);
        });
  }

  renderTableRow = hookGroupId => {
    const hookGroupUrl = `/hooks/${hookGroupId}`;

    return (
      <TableRow key={hookGroupId}>
        <TableCell>
          <Link to={hookGroupUrl}>{hookGroupId}</Link>
        </TableCell>
      </TableRow>
    );
  };

  render() {
    const { sortBy, sortDirection } = this.state;
    const headers = [
      { label: 'Hook Group ID', id: 'hookGroupId', type: 'string' },
    ];

    return (
      <DataTable
        items={this.sortedHookGroups}
        sortByLabel={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        renderRow={this.renderTableRow}
        headers={headers}
      />
    );
  }
}
