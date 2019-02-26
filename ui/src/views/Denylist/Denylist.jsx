import React, { PureComponent, Fragment } from 'react';
import { string } from 'prop-types';
import { graphql } from 'react-apollo';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import dotProp from 'dot-prop-immutable';
import DenylistTable from '../../components/DenylistTable';
import ErrorPanel from '../../components/ErrorPanel';
import notificationsQuery from './denylist.graphql';
import { VIEW_DENYLISTED_NOTIFICATIONS_PAGE_SIZE } from '../../utils/constants';

@graphql(notificationsQuery, {
  options: props => ({
    variables: {
      notificationsConnection: {
        limit: VIEW_DENYLISTED_NOTIFICATIONS_PAGE_SIZE,
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
          limit: VIEW_DENYLISTED_NOTIFICATIONS_PAGE_SIZE,
          cursor,
          previousCursor,
        },
        filter: {
          ...(searchTerm
            ? { NotificationAddress: { $regex: searchTerm } }
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
        <ErrorPanel error={error} />
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
