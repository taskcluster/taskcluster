import React, { Component } from 'react';
import { withApollo } from 'react-apollo';
import { bool, func } from 'prop-types';
import { withAuth } from '../../utils/Auth';
import CredentialsDialog from './CredentialsDialog';

@withAuth
@withApollo
export default class SignInDialog extends Component {
  static propTypes = {
    open: bool.isRequired,
    onClose: func.isRequired,
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

    return (
      <CredentialsDialog
        onSignIn={this.handleCredentialsSignIn}
        open={open}
        onClose={onClose}
      />
    );
  }
}
