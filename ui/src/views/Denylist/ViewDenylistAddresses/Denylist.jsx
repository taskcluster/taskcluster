import React, { PureComponent, Fragment } from 'react';
import { string } from 'prop-types';
import { graphql } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import Spinner from '../../../components/Spinner';
import DenylistTable from '../../../components/DenylistTable';
import ErrorPanel from '../../../components/ErrorPanel';
import notificationsQuery from './denylist.graphql';
import { VIEW_DENYLIST_PAGE_SIZE } from '../../../utils/constants';

@graphql(notificationsQuery, {
  options: props => ({
    fetchPolicy: 'network-only',
    variables: {
      notificationsConnection: {
        limit: VIEW_DENYLIST_PAGE_SIZE,
      },
      filter: {
        ...(props.searchTerm
          ? { notificationAddress: { $regex: props.searchTerm } }
          : null),
      },
    },
  }),
})
export default class Denylist extends PureComponent {
  static propTypes = {
    searchTerm: string,
  };

  static defaultProps = {
    searchTerm: null,
  };

  handlePageChange = ({ cursor, previousCursor }) => {
    const {
      searchTerm,
      data: { fetchMore },
    } = this.props;

    return fetchMore({
      query: notificationsQuery,
      variables: {
        notificationsConnection: {
          limit: VIEW_DENYLIST_PAGE_SIZE,
          cursor,
          previousCursor,
        },
        filter: {
          ...(searchTerm
            ? { notificationAddress: { $regex: searchTerm } }
            : null),
        },
      },
      updateQuery(previousResult, { fetchMoreResult }) {
        const { edges, pageInfo } = fetchMoreResult.listDenylistAddresses;

        return dotProp.set(
          previousResult,
          'listDenylistAddresses',
          listDenylistAddresses =>
            dotProp.set(
              dotProp.set(listDenylistAddresses, 'edges', edges),
              'pageInfo',
              pageInfo
            )
        );
      },
    });
  };

  render() {
    const {
      data: { loading, error, listDenylistAddresses },
    } = this.props;

    return (
      <Fragment>
        {loading && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {listDenylistAddresses && (
          <DenylistTable
            onPageChange={this.handlePageChange}
            notificationsConnection={listDenylistAddresses}
          />
        )}
      </Fragment>
    );
  }
}
