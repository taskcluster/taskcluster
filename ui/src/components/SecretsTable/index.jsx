import React, { Component } from 'react';
import { func, shape, string } from 'prop-types';
import { pipe, map, sort as rSort } from 'ramda';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import DeleteIcon from 'mdi-react/DeleteIcon';
import { memoize } from '../../utils/memoize';
import Button from '../Button';
import ConnectionDataTable from '../ConnectionDataTable';
import { VIEW_SECRETS_PAGE_SIZE } from '../../utils/constants';
import sort from '../../utils/sort';
import Link from '../../utils/Link';
import { pageInfo, secrets } from '../../utils/prop-types';

const sorted = pipe(
  rSort((a, b) => sort(a.node.name, b.node.name)),
  map(({ node: { name } }) => name)
);
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
    /** Secrets GraphQL PageConnection instance. */
    secretsConnection: shape({
      edges: secrets,
      pageInfo,
    }).isRequired,
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

  createSortedSecretsConnection = memoize(
    (secretsConnection, sortBy, sortDirection) => {
      if (!sortBy) {
        return secretsConnection;
      }

      return {
        ...secretsConnection,
        edges: [...secretsConnection.edges].sort((a, b) => {
          const firstElement =
            sortDirection === 'desc'
              ? this.valueFromNode(b.node)
              : this.valueFromNode(a.node);
          const secondElement =
            sortDirection === 'desc'
              ? this.valueFromNode(a.node)
              : this.valueFromNode(b.node);

          return sort(firstElement, secondElement);
        }),
      };
    },
    {
      serializer: ([secretsConnection, sortBy, sortDirection]) => {
        const ids = sorted(secretsConnection.edges);

        return `${ids.join('-')}-${sortBy}-${sortDirection}`;
      },
    }
  );

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  valueFromNode(node) {
    const mapping = {
      'Secret ID': node.name,
    };

    return mapping[this.state.sortBy];
  }

  render() {
    const {
      onPageChange,
      classes,
      secretsConnection,
      searchTerm,
      onDialogActionOpen,
    } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedSecretsConnection = this.createSortedSecretsConnection(
      secretsConnection,
      sortBy,
      sortDirection
    );

    return (
      <ConnectionDataTable
        searchTerm={searchTerm}
        connection={sortedSecretsConnection}
        pageSize={VIEW_SECRETS_PAGE_SIZE}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        onPageChange={onPageChange}
        allowFilter
        filterFunc={({ node: { name } }, filterValue) =>
          String(name).includes(filterValue)
        }
        headers={['Secret ID']}
        lazyRender
        renderRow={({ node: { name } }, style, key) => (
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
