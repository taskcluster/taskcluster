import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import { arrayOf, bool, string } from 'prop-types';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import LinkIcon from 'mdi-react/LinkIcon';
import { notificationAddress, pagination } from '../../utils/prop-types';
import { VIEW_DENYLIST_PAGE_SIZE } from '../../utils/constants';
import sort from '../../utils/sort';
import titleCase from '../../utils/titleCase';
import PaginatedDataTable from '../PaginatedDataTable';

const tableHeaders = ['Address', 'Type'];
const iconSize = 16;
// property corresponding to the column name
const propertyFromColName = colName =>
  colName === 'Type' ? 'notificationType' : 'notificationAddress';

@withStyles(theme => ({
  tableCell: {
    textDecoration: 'none',
  },
  listItemCell: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    padding: theme.spacing(1),
  },
  listLinkCell: {
    ...theme.mixins.hover,
    ...theme.mixins.listItemButton,
  },
}))
export default class DenylistTable extends Component {
  static propTypes = {
    /** One page of denylisted notification addresses. */
    addresses: arrayOf(notificationAddress).isRequired,
    /** A search term used to refine the list of notifications. */
    searchTerm: string,
    loading: bool,
    ...pagination,
  };

  static defaultProps = {
    searchTerm: null,
    loading: false,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  state = {
    sortBy: tableHeaders[0],
    sortDirection: 'asc',
  };

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  render() {
    const {
      classes,
      addresses,
      searchTerm,
      loading,
      page,
      hasNextPage,
      hasPreviousPage,
      onNextPage,
      onPreviousPage,
    } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortByProperty = propertyFromColName(sortBy);
    const sortedAddresses = sortBy
      ? [...addresses].sort((a, b) =>
          sortDirection === 'desc'
            ? sort(b[sortByProperty], a[sortByProperty])
            : sort(a[sortByProperty], b[sortByProperty])
        )
      : addresses;

    return (
      <PaginatedDataTable
        items={sortedAddresses}
        pageSize={VIEW_DENYLIST_PAGE_SIZE}
        page={page}
        loading={loading}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
        onNextPage={onNextPage}
        onPreviousPage={onPreviousPage}
        headers={tableHeaders}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        searchTerm={searchTerm}
        noItemsMessage="No denylisted addresses for this page."
        renderRow={address => (
          <TableRow key={address.notificationAddress}>
            <TableCell>
              <Link
                className={classes.tableCell}
                to={`/notify/denylist/${encodeURIComponent(
                  address.notificationAddress
                )}`}>
                <div
                  className={classNames(
                    classes.listItemCell,
                    classes.listLinkCell
                  )}>
                  {address.notificationAddress}
                  <LinkIcon size={iconSize} />
                </div>
              </Link>
            </TableCell>
            <TableCell>
              <div className={classes.listItemCell}>
                {titleCase(address.notificationType)}
              </div>
            </TableCell>
          </TableRow>
        )}
      />
    );
  }
}
