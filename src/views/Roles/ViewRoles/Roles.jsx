import React, { PureComponent, Fragment } from 'react';
import { string } from 'prop-types';
import { graphql } from 'react-apollo';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import dotProp from 'dot-prop-immutable';
import RolesTable from '../../../components/RolesTable';
import ErrorPanel from '../../../components/ErrorPanel';
import rolesQuery from './roles.graphql';
import { VIEW_ROLES_PAGE_SIZE } from '../../../utils/constants';

@graphql(rolesQuery, {
  options: props => ({
    variables: {
      rolesConnection: {
        limit: VIEW_ROLES_PAGE_SIZE,
      },
      filter: {
        ...(props.searchTerm ? { roleId: { $regex: props.searchTerm } } : null),
      },
    },
  }),
})
export default class Roles extends PureComponent {
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
      query: rolesQuery,
      variables: {
        rolesConnection: {
          limit: VIEW_ROLES_PAGE_SIZE,
          cursor,
          previousCursor,
        },
        filter: {
          ...(searchTerm ? { roleId: { $regex: searchTerm } } : null),
        },
      },
      updateQuery(previousResult, { fetchMoreResult }) {
        const { edges, pageInfo } = fetchMoreResult.listRoleIds;

        return dotProp.set(previousResult, 'listRoleIds', listRoleIds =>
          dotProp.set(
            dotProp.set(listRoleIds, 'edges', edges),
            'pageInfo',
            pageInfo
          )
        );
      },
    });
  };

  render() {
    const {
      data: { loading, error, listRoleIds },
    } = this.props;

    return (
      <Fragment>
        {loading && <Spinner loading />}
        <ErrorPanel error={error} />
        {listRoleIds && (
          <RolesTable
            onPageChange={this.handlePageChange}
            rolesConnection={listRoleIds}
          />
        )}
      </Fragment>
    );
  }
}
