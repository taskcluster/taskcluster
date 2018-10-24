import { hot } from 'react-hot-loader';
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
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import ClientForm from '../../../components/ClientForm';
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
  },
  clearIcon: {
    fill: THEME.PRIMARY_TEXT_LIGHT,
  },
}))
export default class ViewClient extends Component {
  state = {
    loading: false,
    error: null,
    accessToken: null,
    accessTokenPanelOpen: true,
  };

  handleAccessTokenWarningClose = () => {
    this.setState({ accessToken: null });
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
    this.setState({ accessToken: null, accessTokenPanelOpen: false });
  };

  handleSaveClient = async (client, clientId) => {
    const { isNewClient } = this.props;

    this.setState({ error: null, loading: true });

    try {
      await this.props.client.mutate({
        mutation: isNewClient ? createClientQuery : updateClientQuery,
        variables: {
          clientId,
          client,
        },
      });

      this.setState({ error: null, loading: false });

      if (isNewClient) {
        this.props.history.push(
          `/auth/clients/${encodeURIComponent(clientId)}`
        );
      }
    } catch (error) {
      this.setState({ error, loading: false });
    }
  };

  render() {
    const { error, loading, accessToken, accessTokenPanelOpen } = this.state;
    const { isNewClient, data, classes } = this.props;

    return (
      <Dashboard title={isNewClient ? 'Create Client' : 'Client'}>
        <Fragment>
          {error && <ErrorPanel error={error} />}
          <Collapse in={accessToken && accessTokenPanelOpen}>
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
            <ClientForm
              loading={loading}
              isNewClient
              onSaveClient={this.handleSaveClient}
            />
          ) : (
            <Fragment>
              {data.loading && <Spinner loading />}
              {data &&
                data.error &&
                data.error.graphQLErrors && (
                  <ErrorPanel error={data.error.graphQLErrors[0].message} />
                )}
              {data &&
                data.client && (
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
      </Dashboard>
    );
  }
}
