import React, { Component, Fragment } from 'react';
import { Notify } from '@taskcluster/client-web';
import Typography from '@material-ui/core/Typography';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import DenylistForm from '../../../components/DenylistForm';
import ErrorPanel from '../../../components/ErrorPanel';
import formatError from '../../../utils/formatError';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';

@withTaskclusterClient
export default class ViewDenylistAddress extends Component {
  state = {
    loading: false,
    address: null,
    // Fetch and mutation errors
    error: null,
    dialogError: null,
    dialogOpen: false,
  };

  get notifyClient() {
    return this.props.createTaskclusterClient({ Class: Notify });
  }

  get notificationAddress() {
    return decodeURIComponent(this.props.match.params.notificationAddress);
  }

  componentDidMount() {
    if (!this.props.isNewAddress) {
      this.fetchAddress();
    }
  }

  /**
   * There is no lookup-by-address endpoint, so walk the list until the exact
   * address turns up or the pages run out.
   */
  fetchAddress = async () => {
    const { notificationAddress } = this;

    this.setState({ loading: true, error: null, address: null });

    try {
      let continuationToken;
      let address = null;

      do {
        const response = await this.notifyClient.listDenylist(
          continuationToken ? { continuationToken } : {}
        );

        address =
          response.addresses.find(
            candidate => candidate.notificationAddress === notificationAddress
          ) ?? null;
        continuationToken = response.continuationToken;
      } while (!address && continuationToken);

      this.setState({ loading: false, address });
    } catch (error) {
      this.setState({ loading: false, error });
    }
  };

  handleAddressDelete = (notificationType, notificationAddress) => {
    this.setState({ dialogError: null, loading: true });

    return this.notifyClient.deleteDenylistAddress({
      notificationType,
      notificationAddress,
    });
  };

  handleDialogActionError = error => {
    this.setState({ dialogError: error, loading: false });
  };

  handleDialogActionComplete = () => {
    this.props.history.push(`/notify/denylist`);
  };

  handleAddressAdd = async (notificationType, notificationAddress) => {
    this.setState({ error: null, loading: true });

    try {
      await this.notifyClient.addDenylistAddress({
        notificationType,
        notificationAddress,
      });

      this.setState({ error: null, loading: false });

      this.props.history.push(
        `/notify/denylist/${encodeURIComponent(notificationAddress)}`
      );
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

  render() {
    const { loading, address, error, dialogError, dialogOpen } = this.state;
    const { isNewAddress } = this.props;

    return (
      <Dashboard
        title={isNewAddress ? 'Add Denylist Address' : 'Denylist Address'}>
        <ErrorPanel fixed error={formatError(error)} />
        {isNewAddress ? (
          <DenylistForm
            loading={loading}
            isNewAddress
            onAddressAdd={this.handleAddressAdd}
          />
        ) : (
          <Fragment>
            {loading && !address && <Spinner loading />}
            {address && (
              <DenylistForm
                key={address.notificationAddress}
                address={address}
                loading={loading}
                dialogError={dialogError}
                dialogOpen={dialogOpen}
                onDialogActionError={this.handleDialogActionError}
                onDialogActionComplete={this.handleDialogActionComplete}
                onDialogActionClose={this.handleDialogActionClose}
                onDialogActionOpen={this.handleDialogActionOpen}
                onAddressDelete={this.handleAddressDelete}
              />
            )}
            {!loading && !address && !error && (
              <Typography variant="body2">
                <em>{this.notificationAddress}</em> cannot be found.
              </Typography>
            )}
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
