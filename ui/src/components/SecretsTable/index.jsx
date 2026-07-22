import React, { Component } from 'react';
import { arrayOf, func, string } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import DeleteIcon from 'mdi-react/DeleteIcon';
import Button from '../Button';
import ConnectionDataTable from '../ConnectionDataTable';
import { VIEW_SECRETS_PAGE_SIZE } from '../../utils/constants';
import sort from '../../utils/sort';
import Link from '../../utils/Link';
import { pageInfo } from '../../utils/prop-types';

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
    /** Callback function fired when a page is changed. */
    onPageChange: func.isRequired,
    /** Secret names to display. */
    secrets: arrayOf(string).isRequired,
    /** Pagination metadata for the current page. */
    pageInfo: pageInfo.isRequired,
    /** A search term to refine the list of secrets. */
    searchTerm: string,
    onDialogActionOpen: func.isRequired,
  };

  static defaultProps = {
    searchTerm: null,
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
      onPageChange,
      classes,
      secrets,
      pageInfo,
      searchTerm,
      onDialogActionOpen,
    } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedSecrets = sortBy
      ? [...secrets].sort((a, b) =>
          sortDirection === 'desc' ? sort(b, a) : sort(a, b)
        )
      : secrets;

    return (
      <ConnectionDataTable
        searchTerm={searchTerm}
        connection={{ edges: sortedSecrets, pageInfo }}
        pageSize={VIEW_SECRETS_PAGE_SIZE}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        onPageChange={onPageChange}
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
