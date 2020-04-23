import React, { PureComponent, Fragment } from 'react';
import { graphql } from 'react-apollo';
import { string } from 'prop-types';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import dotProp from 'dot-prop-immutable';
import escapeStringRegexp from 'escape-string-regexp';
import RolesTable from '../../../components/RolesTable';
import ErrorPanel from '../../../components/ErrorPanel';
import rolesQuery from './roles.graphql';
import { VIEW_ROLES_PAGE_SIZE } from '../../../utils/constants';

@graphql(rolesQuery, {
  options: props => ({
    fetchPolicy: 'network-only',
    variables: {
      rolesConnection: {
        limit: VIEW_ROLES_PAGE_SIZE,
      },
      filter: {
        ...(props.searchTerm
          ? {
              roleId: {
                $regex: escapeStringRegexp(props.searchTerm),
                $options: 'i',
              },
            }
          : null),
      },
    },
  }),
})
export default class Roles extends PureComponent {
  static propTypes = {
    /** A search term to refine the list of roles. */
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
          ...(searchTerm
            ? {
                roleId: {
                  $regex: escapeStringRegexp(searchTerm),
                  $options: 'i',
                },
              }
            : null),
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
      searchTerm,
    } = this.props;

    return (
      <Fragment>
        {loading && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {listRoleIds && (
          <RolesTable
            searchTerm={searchTerm}
            onPageChange={this.handlePageChange}
            rolesConnection={listRoleIds}
          />
        )}
      </Fragment>
    );
  }
}
