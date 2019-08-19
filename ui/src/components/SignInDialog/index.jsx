import React, { Component } from 'react';
import { withApollo } from 'react-apollo';
import { bool, func } from 'prop-types';
import { parse } from 'qs';
import Avatar from '@material-ui/core/Avatar';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemAvatar from '@material-ui/core/ListItemAvatar';
import ListItemText from '@material-ui/core/ListItemText';
import GithubCircleIcon from 'mdi-react/GithubCircleIcon';
import LoginVariantIcon from 'mdi-react/LoginVariantIcon';
import KeyboardOutlineIcon from 'mdi-react/KeyboardOutlineIcon';
import { withAuth } from '../../utils/Auth';
import CredentialsDialog from './CredentialsDialog';
import UserSession from '../../auth/UserSession';

@withAuth
@withApollo
export default class SignInDialog extends Component {
  static propTypes = {
    open: bool.isRequired,
    onClose: func.isRequired,
  };

  state = {
    credentialsDialogOpen: false,
  };

  shouldStartOauth2LoginFlow() {
    const query = parse(window.location.search.slice(1));

    if (
      query.client_id &&
      query.response_type &&
      query.scope &&
      query.redirect_uri
    ) {
      return true;
    }

    return false;
  }

  componentDidMount() {
    const {
      shouldStartOauth2LoginFlow,
      props: { onAuthorize, onClose },
    } = this;

    window.addEventListener(
      'message',
      async function handler(e) {
        if (e.origin !== window.origin || !e.data || e.data.type !== 'login') {
          return;
        }

        window.removeEventListener('message', handler);
        await onAuthorize(UserSession.create(e.data));

        if (shouldStartOauth2LoginFlow()) {
          window.location.href = `${
            window.location.origin
          }/login/oauth/authorize${window.location.search}`;
        }

        onClose();
      },
      false
    );
  }

  handleCredentialsDialogClose = () => {
    this.setState({ credentialsDialogOpen: false });
  };

  handleCredentialsDialogOpen = () => {
    this.setState({ credentialsDialogOpen: true });
  };

  handleCredentialsSignIn = credentials => {
    const inOneThousandYears = new Date();

    inOneThousandYears.setDate(inOneThousandYears.getDate() + 365 * 1000);

    this.props.onAuthorize(
      UserSession.create({
        identityProviderId: 'manual',
        credentials,
        expires: inOneThousandYears.toISOString(),
        providerExpires: inOneThousandYears.toISOString(),
        profile: {
          username: credentials.clientId,
          displayName: credentials.clientId,
        },
      })
    );
    this.props.onClose();
  };

  render() {
    const { onClose, open } = this.props;
    const { credentialsDialogOpen } = this.state;
    const strategies = window.env.UI_LOGIN_STRATEGY_NAMES
      ? window.env.UI_LOGIN_STRATEGY_NAMES.split(' ')
      : [];

    return strategies.length > 0 ? (
      <Dialog
        open={open}
        onClose={onClose}
        aria-labelledby="sign-in-dialog-title">
        <DialogTitle id="sign-in-dialog-title">Sign In</DialogTitle>
        <DialogContent>
          <List>
            {strategies.includes('mozilla-auth0') && (
              <ListItem
                button
                component="a"
                href="/login/mozilla-auth0"
                target="_blank">
                <ListItemAvatar>
                  <Avatar>
                    <LoginVariantIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText primary="Sign in with Auth0" />
              </ListItem>
            )}
            {strategies.includes('github') && (
              <ListItem
                button
                component="a"
                href="/login/github"
                target="_blank">
                <ListItemAvatar>
                  <Avatar>
                    <GithubCircleIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText primary="Sign in with GitHub" />
              </ListItem>
            )}
            <ListItem button onClick={this.handleCredentialsDialogOpen}>
              <ListItemAvatar>
                <Avatar>
                  <KeyboardOutlineIcon />
                </Avatar>
              </ListItemAvatar>
              <ListItemText primary="Sign in with credentials" />
            </ListItem>
          </List>
          <CredentialsDialog
            onSignIn={this.handleCredentialsSignIn}
            open={credentialsDialogOpen}
            onClose={this.handleCredentialsDialogClose}
          />
        </DialogContent>
      </Dialog>
    ) : (
      <CredentialsDialog
        onSignIn={this.handleCredentialsSignIn}
        open={open}
        onClose={onClose}
      />
    );
  }
}
