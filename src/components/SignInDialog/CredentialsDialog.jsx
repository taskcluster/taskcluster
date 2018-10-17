import React, { Component } from 'react';
import { func } from 'prop-types';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import TextField from '@material-ui/core/TextField';

export default class CredentialsDialog extends Component {
  static propTypes = {
    onSignIn: func.isRequired,
  };

  state = {
    isCertificateValid: true,
    clientId: '',
    accessToken: '',
    certificate: '',
  };

  handleFieldChange = e => {
    let { isCertificateValid } = this.state;

    try {
      if (e.target.name === 'certificate' && e.target.value) {
        JSON.parse(e.target.value);
        isCertificateValid = true;
      }
    } catch (err) {
      isCertificateValid = false;
    }

    this.setState({
      [e.target.name]: e.target.value,
      isCertificateValid,
    });
  };

  handleSubmit = e => {
    e.preventDefault();

    const { isCertificateValid, ...credentials } = this.state;

    if (isCertificateValid && credentials.clientId && credentials.accessToken) {
      this.props.onSignIn(credentials);
    }
  };

  render() {
    const { onSignIn, ...props } = this.props;
    const {
      isCertificateValid,
      clientId,
      accessToken,
      certificate,
    } = this.state;
    const isFormValid = clientId && accessToken && isCertificateValid;

    return (
      <Dialog {...props} aria-labelledby="credentials-dialog-title">
        <form onSubmit={this.handleSubmit} aria-disabled={!isFormValid}>
          <DialogTitle id="credentials-dialog-title">
            Sign in with credentials
          </DialogTitle>
          <DialogContent>
            <DialogContentText>
              <em>Note: Credentials are not checked for validity.</em>
            </DialogContentText>
            <TextField
              autoFocus
              margin="dense"
              name="clientId"
              label="Client ID"
              value={clientId}
              onChange={this.handleFieldChange}
              error={!clientId && clientId !== ''}
              required
              fullWidth
            />
            <TextField
              margin="dense"
              name="accessToken"
              label="Access Token"
              value={accessToken}
              onChange={this.handleFieldChange}
              error={!accessToken && accessToken !== ''}
              required
              fullWidth
            />
            <TextField
              name="certificate"
              label="JSON Certificate"
              value={certificate}
              onChange={this.handleFieldChange}
              error={!isCertificateValid && certificate !== ''}
              fullWidth
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={this.props.onClose}>Cancel</Button>
            <Button
              color="secondary"
              variant="contained"
              disabled={!isFormValid}
              type="submit"
            >
              Sign In
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    );
  }
}
