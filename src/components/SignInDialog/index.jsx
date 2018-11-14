import React, { Component } from 'react';
import { withApollo } from 'react-apollo';
import { bool, func } from 'prop-types';
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
import { withAuth } from '../../utils/Auth';
import CredentialsDialog from './CredentialsDialog';

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

  componentDidMount() {
    const { onAuthorize, onClose } = this.props;

    window.addEventListener(
      'message',
      function handler(e) {
        if (e.origin !== window.origin || !e.data || e.data.type !== 'login') {
          return;
        }

        onAuthorize(e.data);
        window.removeEventListener('message', handler);
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

  handleCredentialsSignIn = async credentials => {
    const inOneWeek = new Date();

    inOneWeek.setDate(inOneWeek.getDate() + 7);

    // Since Apollo caches query results, it’s important to get rid of them
    // when the login state changes.
    this.props.onAuthorize({
      credentials,
      expires: inOneWeek.toISOString(),
      profile: {
        username: credentials.clientId,
        displayName: credentials.clientId,
      },
    });
    await this.props.client.resetStore();
    this.props.onClose();
  };

  render() {
    const { onClose, open } = this.props;
    const { credentialsDialogOpen } = this.state;

    return (
      <Dialog
        open={open}
        onClose={onClose}
        aria-labelledby="sign-in-dialog-title">
        <DialogTitle id="sign-in-dialog-title">Sign In</DialogTitle>
        <DialogContent>
          <List>
            {process.env.LOGIN_STRATEGIES.includes('github') && (
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
                  <LoginVariantIcon />
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
    );
  }
}
