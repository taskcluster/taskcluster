import React, { Component } from 'react';
import { arrayOf, bool, func, string } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import DeleteIcon from 'mdi-react/DeleteIcon';
import Button from '../Button';
import PaginatedDataTable from '../PaginatedDataTable';
import { VIEW_ROLES_PAGE_SIZE } from '../../utils/constants';
import { pagination } from '../../utils/prop-types';
import sort from '../../utils/sort';
import Link from '../../utils/Link';

const iconSize = 16;

@withStyles(theme => ({
  roleIdLink: {
    display: 'flex',
    flexGrow: 1,
  },
  roleContainer: {
    paddingTop: theme.spacing(1.5),
    paddingBottom: theme.spacing(1.5),
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
    display: 'flex',
    width: '100%',
  },
}))
export default class RolesTable extends Component {
  static propTypes = {
    roleIds: arrayOf(string).isRequired,
    searchTerm: string,
    loading: bool,
    ...pagination,
    onDialogActionOpen: func.isRequired,
  };

  static defaultProps = {
    searchTerm: null,
    loading: false,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  state = {
    sortBy: null,
    sortDirection: null,
  };

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  render() {
    const {
      classes,
      roleIds,
      searchTerm,
      loading,
      page,
      hasNextPage,
      hasPreviousPage,
      onNextPage,
      onPreviousPage,
      onDialogActionOpen,
    } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedRoleIds = sortBy
      ? [...roleIds].sort((a, b) =>
          sortDirection === 'desc' ? sort(b, a) : sort(a, b)
        )
      : roleIds;

    return (
      <PaginatedDataTable
        searchTerm={searchTerm}
        items={sortedRoleIds}
        pageSize={VIEW_ROLES_PAGE_SIZE}
        page={page}
        loading={loading}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
        onNextPage={onNextPage}
        onPreviousPage={onPreviousPage}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        allowFilter
        filterFunc={(roleId, filterValue) =>
          roleId.toLowerCase().includes(filterValue.toLowerCase())
        }
        headers={['Role ID']}
        lazyRender
        renderRow={(roleId, style, key) => (
          <TableRow key={key || roleId} style={style} hover>
            <TableCell className={classes.roleContainer}>
              <Link
                className={classes.roleIdLink}
                to={`/auth/roles/${encodeURIComponent(roleId)}`}>
                {roleId}
              </Link>
              <Button
                requiresAuth
                tooltipProps={{ title: 'Delete Role' }}
                size="small"
                onClick={() => onDialogActionOpen(roleId)}>
                <DeleteIcon size={iconSize} />
              </Button>
            </TableCell>
          </TableRow>
        )}
      />
    );
  }
}
