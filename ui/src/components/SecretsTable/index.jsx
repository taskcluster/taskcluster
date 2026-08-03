import React, { Component } from 'react';
import { arrayOf, bool, func, number, string } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import DeleteIcon from 'mdi-react/DeleteIcon';
import Button from '../Button';
import PaginatedDataTable from '../PaginatedDataTable';
import { VIEW_SECRETS_PAGE_SIZE } from '../../utils/constants';
import sort from '../../utils/sort';
import Link from '../../utils/Link';

const iconSize = 16;

@withStyles(theme => ({
  secretContainer: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    paddingTop: theme.spacing(1.5),
    paddingBottom: theme.spacing(1.5),
  },
  nameLink: {
    flexGrow: 1,
    display: 'flex',
  },
}))
/**
 * Display secrets in a table.
 */
export default class SecretsTable extends Component {
  static propTypes = {
    /** One page of secrets. */
    secrets: arrayOf(string).isRequired,
    /** A search term to refine the list of secrets. */
    searchTerm: string,
    loading: bool,
    page: number.isRequired,
    hasNextPage: bool,
    hasPreviousPage: bool,
    /** Called when the user asks for the next page. */
    onNextPage: func.isRequired,
    /** Called when the user asks for the previous page. */
    onPreviousPage: func.isRequired,
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
      secrets,
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
    const sortedSecrets = sortBy
      ? [...secrets].sort((a, b) =>
          sortDirection === 'desc' ? sort(b, a) : sort(a, b)
        )
      : secrets;

    return (
      <PaginatedDataTable
        searchTerm={searchTerm}
        items={sortedSecrets}
        pageSize={VIEW_SECRETS_PAGE_SIZE}
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
        filterFunc={(name, filterValue) => name.includes(filterValue)}
        headers={['Secret ID']}
        lazyRender
        renderRow={(name, style, key) => (
          <TableRow key={key || name} style={style} hover>
            <TableCell className={classes.secretContainer}>
              <Link
                className={classes.nameLink}
                to={`/secrets/${encodeURIComponent(name)}`}>
                {name}
              </Link>
              <Button
                requiresAuth
                tooltipProps={{ title: 'Delete Secret' }}
                size="small"
                onClick={() => onDialogActionOpen(name)}>
                <DeleteIcon size={iconSize} />
              </Button>
            </TableCell>
          </TableRow>
        )}
      />
    );
  }
}
