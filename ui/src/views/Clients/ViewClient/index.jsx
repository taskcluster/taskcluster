import { hot } from 'react-hot-loader/root';
import React, { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import CopyToClipboard from 'react-copy-to-clipboard';
import { withStyles } from '@material-ui/core/styles';
import { fade } from '@material-ui/core/styles/colorManipulator';
import Card from '@material-ui/core/Card';
import CardHeader from '@material-ui/core/CardHeader';
import CardContent from '@material-ui/core/CardContent';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Collapse from '@material-ui/core/Collapse';
import IconButton from '@material-ui/core/IconButton';
import ClearIcon from 'mdi-react/ClearIcon';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Snackbar from '../../../components/Snackbar';
import Dashboard from '../../../components/Dashboard';
import ClientForm from '../../../components/ClientForm';
import ErrorPanel from '../../../components/ErrorPanel';
import updateClientQuery from './updateClient.graphql';
import createClientQuery from './createClient.graphql';
import deleteClientQuery from './deleteClient.graphql';
import disableClientQuery from './disableClient.graphql';
import enableClientQuery from './enableClient.graphql';
import resetAccessTokenQuery from './resetAccessToken.graphql';
import clientQuery from './client.graphql';
import { THEME } from '../../../utils/constants';

@hot(module)
@withApollo
@graphql(clientQuery, {
  skip: ({ match: { params } }) => !params.clientId,
  options: ({ match: { params } }) => ({
    variables: {
      clientId: decodeURIComponent(params.clientId),
    },
  }),
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
    paddingTop: theme.spacing.unit,
    paddingBottom: theme.spacing.unit,
  },
  panelTextPrimary: {
    color: THEME.PRIMARY_TEXT_LIGHT,
  },
  panelTextSecondary: {
    color: THEME.PRIMARY_TEXT_LIGHT,
  },
  panelCard: {
    background: theme.palette.warning.dark,
    marginBottom: theme.spacing.unit,
  },
  clearIcon: {
    fill: THEME.PRIMARY_TEXT_LIGHT,
  },
}))
export default class ViewClient extends Component {
  state = {
    loading: false,
    error: null,
    accessToken: this.props.location.state
      ? this.props.location.state.accessToken
      : null,
    snackbar: {
      message: '',
      variant: 'success',
      open: false,
    },
  };

  handleDeleteClient = async clientId => {
    this.setState({ error: null, loading: true });

    try {
      await this.props.client.mutate({
        mutation: deleteClientQuery,
        variables: { clientId },
      });

      this.setState({ error: null, loading: false });

      this.props.history.push(`/auth/clients`);
    } catch (error) {
      this.setState({ error, loading: false });
    }
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
      data: { refetch },
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

  handleSaveClient = async (client, clientId) => {
    const { isNewClient } = this.props;

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

      if (isNewClient) {
        this.props.history.push({
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
    const { error, loading, accessToken, snackbar } = this.state;
    const { isNewClient, data, classes, location } = this.props;

    if (location.state && location.state.accessToken) {
      const state = { ...location.state };

      delete state.accessToken;
      this.props.history.replace({ state });
    }

    return (
      <Dashboard title={isNewClient ? 'Create Client' : 'Client'}>
        <Fragment>
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
                <CopyToClipboard text={accessToken}>
                  <ListItem button>
                    <ListItemText
                      classes={{
                        primary: classes.panelTextPrimary,
                        secondary: classes.panelTextSecondary,
                      }}
                      primary="Access Token"
                      secondary={accessToken}
                    />
                    <ContentCopyIcon />
                  </ListItem>
                </CopyToClipboard>
              </CardContent>
            </Card>
          </Collapse>
          {isNewClient ? (
            <Fragment>
              <ErrorPanel fixed error={error} />
              <ClientForm
                loading={loading}
                isNewClient
                onSaveClient={this.handleSaveClient}
              />
            </Fragment>
          ) : (
            <Fragment>
              {data.loading && <Spinner loading />}
              <ErrorPanel fixed error={error || data.error} />
              {data && data.client && (
                <ClientForm
                  loading={loading}
                  client={data.client}
                  onResetAccessToken={this.handleResetAccessToken}
                  onSaveClient={this.handleSaveClient}
                  onDeleteClient={this.handleDeleteClient}
                  onDisableClient={this.handleDisableClient}
                  onEnableClient={this.handleEnableClient}
                />
              )}
            </Fragment>
          )}
        </Fragment>
        <Snackbar onClose={this.handleSnackbarClose} {...snackbar} />
      </Dashboard>
    );
  }
}
