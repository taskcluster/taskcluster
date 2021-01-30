import React, { PureComponent, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import { string } from 'prop-types';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Typography from '@material-ui/core/Typography';
import dotProp from 'dot-prop-immutable';
import escapeStringRegexp from 'escape-string-regexp';
import RolesTable from '../../../components/RolesTable';
import ErrorPanel from '../../../components/ErrorPanel';
import DialogAction from '../../../components/DialogAction';
import rolesQuery from './roles.graphql';
import deleteRoleQuery from './deleteRole.graphql';
import { VIEW_ROLES_PAGE_SIZE } from '../../../utils/constants';

@withApollo
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

  state = {
    dialogOpen: false,
    deleteRoleId: null,
    dialogError: null,
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

  handleDialogActionOpen = roleId => {
    this.setState({ dialogOpen: true, deleteRoleId: roleId });
  };

  handleDialogActionError = error => {
    this.setState({ dialogError: error });
  };

  handleDialogActionComplete = () => {
    this.setState({ deleteRoleId: null, dialogError: null });
  };

  handleDialogActionClose = () => {
    this.setState({
      dialogOpen: false,
      deleteRoleId: null,
      dialogError: null,
    });
  };

  handleDeleteRole = async () => {
    this.setState({ dialogError: null });

    const roleId = this.state.deleteRoleId;

    await this.props.client.mutate({
      mutation: deleteRoleQuery,
      variables: { roleId },
    });

    this.props.history.push(`/auth/roles`);
  };

  render() {
    const {
      data: { loading, error, listRoleIds },
      searchTerm,
    } = this.props;
    const { dialogOpen, deleteRoleId, dialogError } = this.state;

    return (
      <Fragment>
        {loading && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {listRoleIds && (
          <RolesTable
            searchTerm={searchTerm}
            onPageChange={this.handlePageChange}
            rolesConnection={listRoleIds}
            onDialogActionOpen={this.handleDialogActionOpen}
          />
        )}
        {dialogOpen && (
          <DialogAction
            open={dialogOpen}
            onSubmit={this.handleDeleteRole}
            onComplete={this.handleDialogActionComplete}
            onClose={this.handleDialogActionClose}
            onError={this.handleDialogActionError}
            error={dialogError}
            title="Delete Role?"
            body={
              <Typography variant="body2">
                This will delete the {deleteRoleId} role.
              </Typography>
            }
            confirmText="Delete Role"
          />
        )}
      </Fragment>
    );
  }
}
