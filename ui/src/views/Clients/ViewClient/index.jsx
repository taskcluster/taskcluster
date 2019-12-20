import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import { parse } from 'qs';
import memoize from 'fast-memoize';
import { omit } from 'ramda';
import { withStyles } from '@material-ui/core/styles';
import { fade } from '@material-ui/core/styles/colorManipulator';
import Card from '@material-ui/core/Card';
import CardHeader from '@material-ui/core/CardHeader';
import CardContent from '@material-ui/core/CardContent';
import Collapse from '@material-ui/core/Collapse';
import IconButton from '@material-ui/core/IconButton';
import ClearIcon from 'mdi-react/ClearIcon';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Typography from '@material-ui/core/Typography';
import { addYears } from 'date-fns';
import { scopeIntersection } from 'taskcluster-lib-scopes';
import Snackbar from '../../../components/Snackbar';
import Dashboard from '../../../components/Dashboard';
import ClientForm from '../../../components/ClientForm';
import ErrorPanel from '../../../components/ErrorPanel';
import CopyToClipboardListItem from '../../../components/CopyToClipboardListItem';
import updateClientQuery from './updateClient.graphql';
import createClientQuery from './createClient.graphql';
import deleteClientQuery from './deleteClient.graphql';
import disableClientQuery from './disableClient.graphql';
import enableClientQuery from './enableClient.graphql';
import resetAccessTokenQuery from './resetAccessToken.graphql';
import currentScopesQuery from './currentScopes.graphql';
import clientQuery from './client.graphql';
import { THEME } from '../../../utils/constants';
import fromNow from '../../../utils/fromNow';
import { withAuth } from '../../../utils/Auth';

@hot(module)
@withAuth
@withApollo
@graphql(clientQuery, {
  name: 'clientData',
  skip: ({ match: { params } }) => !params.clientId,
  options: ({ match: { params } }) => ({
    fetchPolicy: 'network-only',
    variables: {
      clientId: decodeURIComponent(params.clientId),
    },
  }),
})
@graphql(currentScopesQuery, {
  name: 'currentScopesData',
  skip: ({ user }) => !user,
  options: {
    fetchPolicy: 'network-only',
  },
})
@withStyles(theme => ({
  listItemButton: {
    padding: 0,
    '&:last-child': {
      paddingBottom: 0,
    },
    '& svg': {
      transition: theme.transitions.create('fill'),
      fill: fade(THEME.PRIMARY_TEXT_LIGHT, 0.4),
    },
    '&:hover svg': {
      fill: THEME.PRIMARY_TEXT_LIGHT,
    },
  },
  panelHeader: {
    paddingTop: theme.spacing(1),
    paddingBottom: theme.spacing(1),
  },
  panelTextPrimary: {
    color: THEME.PRIMARY_TEXT_LIGHT,
  },
  panelTextSecondary: {
    color: THEME.PRIMARY_TEXT_LIGHT,
  },
  panelCard: {
    background: theme.palette.warning.dark,
    marginBottom: theme.spacing(1),
  },
  clearIcon: {
    fill: THEME.PRIMARY_TEXT_LIGHT,
  },
}))
export default class ViewClient extends Component {
  state = {
    loading: false,
    error: null,
    dialogError: null,
    dialogOpen: false,
    accessToken: this.props.location.state
      ? this.props.location.state.accessToken
      : null,
    snackbar: {
      message: '',
      variant: 'success',
      open: false,
    },
  };

  getClientFormKey = memoize(initialClient => JSON.stringify(initialClient), {
    serializer: initialClient => {
      // expires changes on every render so it's best to keep
      // it out of the caching key
      return JSON.stringify(omit(['expires'], initialClient));
    },
  });

  handleDeleteClient = async clientId => {
    this.setState({ dialogError: null, loading: true });

    return this.props.client.mutate({
      mutation: deleteClientQuery,
      variables: { clientId },
    });
  };

  handleDialogActionError = error => {
    this.setState({ dialogError: error, loading: false });
  };

  handleDialogActionComplete = () => {
    this.props.history.push(`/auth/clients`);
  };

  handleDisableClient = async clientId => {
    this.setState({ error: null, loading: true });

    try {
      await this.props.client.mutate({
        mutation: disableClientQuery,
        variables: { clientId },
        refetchQueries: ['Client'],
      });

      this.setState({ error: null, loading: false });
    } catch (error) {
      this.setState({ error, loading: false });
    }
  };

  handleEnableClient = async clientId => {
    this.setState({ error: null, loading: true });

    try {
      await this.props.client.mutate({
        mutation: enableClientQuery,
        variables: { clientId },
        refetchQueries: ['Client'],
      });

      this.setState({ error: null, loading: false });
    } catch (error) {
      this.setState({ error, loading: false });
    }
  };

  handleResetAccessToken = async clientId => {
    const {
      clientData: { refetch },
      client,
    } = this.props;

    this.setState({ error: null, loading: true });

    try {
      const result = await client.mutate({
        mutation: resetAccessTokenQuery,
        variables: {
          clientId,
        },
      });

      this.setState({
        error: null,
        loading: false,
        accessToken: result.data.resetAccessToken.accessToken,
      });
      refetch();
    } catch (error) {
      this.setState({ error, loading: false, accessToken: null });
    }
  };

  handleAccessTokenPanelClose = () => {
    this.setState({ accessToken: null });
  };

  // Only localhost callback_url's are allowed.
  // This tool is not intended for other uses
  // than setting up credentials via `taskcluster signin`,
  // which uses this URL format.
  isAllowedCallback = callbackUrl =>
    /^https?:\/\/localhost(:[0-9]+)?(\/|$)/.test(callbackUrl);

  handleSaveClient = async (client, clientId) => {
    const { isNewClient } = this.props;
    const queryString = parse(this.props.location.search.slice(1));
    const callbackUrl = queryString.callback_url;

    // Do not bother creating a client if CLI Login has bad url
    if (callbackUrl && !this.isAllowedCallback(callbackUrl)) {
      this.setState({
        error: `Callback URL ${callbackUrl} is not allowed.`,
      });

      return;
    }

    this.setState({ error: null, loading: true });

    try {
      const result = await this.props.client.mutate({
        mutation: isNewClient ? createClientQuery : updateClientQuery,
        variables: {
          clientId,
          client,
        },
      });

      this.setState({
        error: null,
        loading: false,
      });

      // CLI login
      if (callbackUrl) {
        window.location.replace(
          `${callbackUrl}?clientId=${clientId}&accessToken=${result.data.createClient.accessToken}`
        );

        return;
      }

      if (isNewClient) {
        this.props.history.replace({
          pathname: `/auth/clients/${encodeURIComponent(clientId)}`,
          state: { accessToken: result.data.createClient.accessToken },
        });

        return;
      }

      this.handleSnackbarOpen({ message: 'Client Saved', open: true });
    } catch (error) {
      this.setState({ error, loading: false });
    }
  };

  handleDialogActionClose = () => {
    this.setState({
      dialogOpen: false,
      dialogError: null,
      error: null,
    });
  };

  handleDialogActionOpen = () => {
    this.setState({ dialogOpen: true });
  };

  handleSnackbarOpen = ({ message, variant = 'success', open }) => {
    this.setState({ snackbar: { message, variant, open } });
  };

  handleSnackbarClose = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }

    this.setState({
      snackbar: { message: '', variant: 'success', open: false },
    });
  };

  render() {
    const {
      error,
      loading,
      accessToken,
      snackbar,
      dialogError,
      dialogOpen,
    } = this.state;
    const {
      isNewClient,
      clientData,
      currentScopesData,
      classes,
      location,
      user,
    } = this.props;
    const query = parse(location.search.slice(1));
    const initialClient = {
      description: query.description,
      clientId: query.client_id,
      expires: query.expires
        ? fromNow(query.expires)
        : addYears(new Date(), 1000),
      deleteOnExpiration: true,
      scopes: typeof query.scope === 'string' ? [query.scope] : query.scope,
      expandedScopes: null,
      disabled: false,
    };
    const isCliLogin = Boolean(query.callback_url);
    const isClientDisabled =
      clientData && clientData.client && clientData.client.disabled;

    // CLI login
    if (
      isCliLogin &&
      user &&
      currentScopesData &&
      currentScopesData.currentScopes
    ) {
      Object.assign(initialClient, {
        clientId: `${user.credentials.clientId}/${query.name}`,
        scopes: scopeIntersection(
          initialClient.scopes,
          currentScopesData.currentScopes
        ),
      });
    }

    if (location.state && location.state.accessToken) {
      const state = { ...location.state };

      delete state.accessToken;
      this.props.history.replace({ state });
    }

    return (
      <Dashboard title={isNewClient ? 'Create Client' : 'Client'}>
        <Collapse in={accessToken}>
          <Card classes={{ root: classes.panelCard }}>
            <CardHeader
              classes={{
                root: classes.panelHeader,
                title: classes.panelTextPrimary,
              }}
              action={
                <IconButton onClick={this.handleAccessTokenPanelClose}>
                  <ClearIcon className={classes.clearIcon} />
                </IconButton>
              }
              title="You won't be able to see this again"
            />
            <CardContent className={classes.listItemButton}>
              <CopyToClipboardListItem
                tooltipTitle={accessToken}
                textToCopy={accessToken}
                primary="AccessToken"
                secondary={accessToken}
                listItemTextProps={{
                  classes: {
                    primary: classes.panelTextPrimary,
                    secondary: classes.panelTextSecondary,
                  },
                }}
              />
            </CardContent>
          </Card>
        </Collapse>
        {!isCliLogin || user ? (
          <Fragment>
            {isNewClient ? (
              <Fragment>
                <ErrorPanel fixed error={error} />
                <ClientForm
                  key={this.getClientFormKey(initialClient)}
                  loading={loading}
                  client={initialClient}
                  isNewClient
                  onSaveClient={this.handleSaveClient}
                />
              </Fragment>
            ) : (
              <Fragment>
                {((clientData && clientData.loading) ||
                  (currentScopesData && currentScopesData.loading)) && (
                  <Spinner loading />
                )}
                <ErrorPanel
                  fixed
                  warning={isClientDisabled}
                  error={
                    (isClientDisabled && 'Disabled') ||
                    error ||
                    (clientData && clientData.error) ||
                    (currentScopesData && currentScopesData.error)
                  }
                />
                {clientData && clientData.client && (
                  <ClientForm
                    dialogError={dialogError}
                    loading={loading}
                    client={clientData.client}
                    onResetAccessToken={this.handleResetAccessToken}
                    onSaveClient={this.handleSaveClient}
                    onDeleteClient={this.handleDeleteClient}
                    onDisableClient={this.handleDisableClient}
                    onEnableClient={this.handleEnableClient}
                    dialogOpen={dialogOpen}
                    onDialogActionError={this.handleDialogActionError}
                    onDialogActionComplete={this.handleDialogActionComplete}
                    onDialogActionClose={this.handleDialogActionClose}
                    onDialogActionOpen={this.handleDialogActionOpen}
                  />
                )}
              </Fragment>
            )}
          </Fragment>
        ) : (
          <Typography variant="subtitle1">
            Sign in to create a client
          </Typography>
        )}
        <Snackbar onClose={this.handleSnackbarClose} {...snackbar} />
      </Dashboard>
    );
  }
}
