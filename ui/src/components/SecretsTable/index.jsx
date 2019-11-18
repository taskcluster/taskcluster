import React, { Component } from 'react';
import { func, shape } from 'prop-types';
import { pipe, map, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import LinkIcon from 'mdi-react/LinkIcon';
import TableCellItem from '../TableCellItem';
import ConnectionDataTable from '../ConnectionDataTable';
import { VIEW_SECRETS_PAGE_SIZE } from '../../utils/constants';
import sort from '../../utils/sort';
import Link from '../../utils/Link';
import { pageInfo, secrets } from '../../utils/prop-types';

const sorted = pipe(
  rSort((a, b) => sort(a.node.name, b.node.name)),
  map(({ node: { name } }) => name)
);

@withStyles({
  listItemCell: {
    width: '100%',
  },
})
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
    const { onPageChange, classes, secretsConnection } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedSecretsConnection = this.createSortedSecretsConnection(
      secretsConnection,
      sortBy,
      sortDirection
    );
    const iconSize = 16;

    return (
      <ConnectionDataTable
        connection={sortedSecretsConnection}
        pageSize={VIEW_SECRETS_PAGE_SIZE}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        onPageChange={onPageChange}
        headers={['Secret ID']}
        renderRow={({ node: { name } }) => (
          <TableRow key={name}>
            <TableCell>
              <Link to={`/secrets/${encodeURIComponent(name)}`}>
                <TableCellItem className={classes.listItemCell} dense button>
                  {name}
                  <LinkIcon size={iconSize} />
                </TableCellItem>
              </Link>
            </TableCell>
          </TableRow>
        )}
      />
    );
  }
}
