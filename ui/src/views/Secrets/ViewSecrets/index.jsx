import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import PlusIcon from 'mdi-react/PlusIcon';
import escapeStringRegexp from 'escape-string-regexp';
import qs from 'qs';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import SecretsTable from '../../../components/SecretsTable';
import HelpView from '../../../components/HelpView';
import Button from '../../../components/Button';
import { VIEW_SECRETS_PAGE_SIZE } from '../../../utils/constants';
import ErrorPanel from '../../../components/ErrorPanel';
import DialogAction from '../../../components/DialogAction';
import secretsQuery from './secrets.graphql';
import deleteSecretQuery from './deleteSecret.graphql';

@hot(module)
@withApollo
@graphql(secretsQuery, {
  options: props => {
    const { search } = qs.parse(props.location.search.slice(1));

    return {
      fetchPolicy: 'network-only',
      variables: {
        secretsConnection: {
          limit: VIEW_SECRETS_PAGE_SIZE,
        },
        filter: search
          ? { name: { $regex: escapeStringRegexp(search), $options: 'i' } }
          : null,
      },
    };
  },
})
@withStyles(theme => ({
  plusIconSpan: {
    ...theme.mixins.fab,
  },
}))
export default class ViewSecrets extends Component {
  state = {
    dialogOpen: false,
    deleteSecretName: null,
    dialogError: null,
  };

  handleSecretSearchSubmit = async secretSearch => {
    const {
      data: { refetch },
    } = this.props;

    await refetch({
      secretsConnection: {
        limit: VIEW_SECRETS_PAGE_SIZE,
      },
      filter: secretSearch
        ? { name: { $regex: escapeStringRegexp(secretSearch), $options: 'i' } }
        : null,
    });

    const query = qs.parse(window.location.search.slice(1));

    this.props.history.push({
      search: qs.stringify({
        ...query,
        search: secretSearch,
      }),
    });
  };

  handleCreate = () => {
    this.props.history.push('/secrets/create');
  };

  handlePageChange = ({ cursor, previousCursor }) => {
    const {
      data: { fetchMore },
    } = this.props;
    const query = qs.parse(this.props.location.search.slice(1));
    const secretSearch = query.search;

    return fetchMore({
      query: secretsQuery,
      variables: {
        secretsConnection: {
          limit: VIEW_SECRETS_PAGE_SIZE,
          cursor,
          previousCursor,
        },
        filter: secretSearch
          ? {
              name: {
                $regex: escapeStringRegexp(secretSearch),
                $options: 'i',
              },
            }
          : null,
      },
      updateQuery(previousResult, { fetchMoreResult }) {
        const { edges, pageInfo } = fetchMoreResult.secrets;

        return dotProp.set(previousResult, 'secrets', secrets =>
          dotProp.set(
            dotProp.set(secrets, 'edges', edges),
            'pageInfo',
            pageInfo
          )
        );
      },
    });
  };

  handleDeleteSecret = () => {
    this.setState({ dialogError: null });

    const name = this.state.deleteSecretName;

    return this.props.client.mutate({
      mutation: deleteSecretQuery,
      variables: { name },
    });
  };

  handleDialogActionError = error => {
    this.setState({ dialogError: error });
  };

  handleDialogActionComplete = () => {
    this.setState({ dialogOpen: false, deleteSecretName: null });

    this.props.data.refetch();
  };

  handleDialogActionClose = () => {
    this.setState({
      dialogOpen: false,
      deleteSecretName: null,
      dialogError: null,
    });
  };

  handleDialogActionOpen = secretName => {
    this.setState({ dialogOpen: true, deleteSecretName: secretName });
  };

  render() {
    const { dialogOpen, deleteSecretName, dialogError } = this.state;
    const {
      classes,
      description,
      data: { loading, error, secrets },
    } = this.props;
    const query = qs.parse(this.props.location.search.slice(1));
    const secretSearch = query.search;

    return (
      <Dashboard
        title="Secrets"
        helpView={<HelpView description={description} />}
        search={
          <Search
            disabled={loading}
            defaultValue={secretSearch}
            onSubmit={this.handleSecretSearchSubmit}
            placeholder="Secret contains"
          />
        }>
        <Fragment>
          {loading && <Spinner loading />}
          <ErrorPanel fixed error={error} />
          {secrets && (
            <SecretsTable
              searchTerm={secretSearch}
              onPageChange={this.handlePageChange}
              secretsConnection={secrets}
              onDialogActionOpen={this.handleDialogActionOpen}
            />
          )}
          <Button
            spanProps={{ className: classes.plusIconSpan }}
            tooltipProps={{
              title: 'Create Secret',
              id: 'create-secret-tooltip',
              enterDelay: 300,
            }}
            onClick={this.handleCreate}
            variant="round"
            color="secondary">
            <PlusIcon />
          </Button>
          {dialogOpen && (
            <DialogAction
              open={dialogOpen}
              onSubmit={this.handleDeleteSecret}
              onComplete={this.handleDialogActionComplete}
              onClose={this.handleDialogActionClose}
              onError={this.handleDialogActionError}
              error={dialogError}
              title="Delete Secret?"
              body={
                <Typography variant="body2">
                  This will delete the secret {deleteSecretName}.
                </Typography>
              }
              confirmText="Delete Secret"
            />
          )}
        </Fragment>
      </Dashboard>
    );
  }
}
