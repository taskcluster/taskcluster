import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Typography from '@material-ui/core/Typography';
import Dashboard from '../../../components/Dashboard';
import DenylistForm from '../../../components/DenylistForm';
import ErrorPanel from '../../../components/ErrorPanel';
import formatError from '../../../utils/formatError';
import denylistAddressQuery from './denylistAddress.graphql';
import addAddressQuery from './addAddress.graphql';
import deleteAddressQuery from './deleteAddress.graphql';

@hot(module)
@withApollo
@graphql(denylistAddressQuery, {
  skip: ({ match: { params } }) => !params.notificationAddress,
  options: ({ match: { params } }) => ({
    fetchPolicy: 'network-only',
    variables: {
      filter: {
        notificationAddress: decodeURIComponent(params.notificationAddress),
      },
    },
  }),
})
export default class ViewDenylistAddress extends Component {
  state = {
    loading: false,
    // Mutation errors
    error: null,
    dialogError: null,
    dialogOpen: false,
  };

  handleAddressDelete = (notificationType, notificationAddress) => {
    this.setState({ dialogError: null, loading: true });

    return this.props.client.mutate({
      mutation: deleteAddressQuery,
      variables: {
        address: {
          notificationAddress,
          notificationType,
        },
      },
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
      await this.props.client.mutate({
        mutation: addAddressQuery,
        variables: {
          address: {
            notificationAddress,
            notificationType,
          },
        },
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
    const { loading, error, dialogError, dialogOpen } = this.state;
    const {
      isNewAddress,
      data,
      match: { params },
    } = this.props;
    const hasDenylistAddresses = Boolean(
      data &&
        data.listDenylistAddresses &&
        data.listDenylistAddresses.edges.length
    );

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
            {data.loading && <Spinner loading />}
            {data && <ErrorPanel fixed error={data.error} />}
            {hasDenylistAddresses && (
              <DenylistForm
                loading={loading}
                dialogError={dialogError}
                dialogOpen={dialogOpen}
                onDialogActionError={this.handleDialogActionError}
                onDialogActionComplete={this.handleDialogActionComplete}
                onDialogActionClose={this.handleDialogActionClose}
                onDialogActionOpen={this.handleDialogActionOpen}
                address={data.listDenylistAddresses.edges[0].node}
                onAddressDelete={this.handleAddressDelete}
              />
            )}
            {!data.loading && !hasDenylistAddresses && (
              <Typography variant="body2">
                <em>{decodeURIComponent(params.notificationAddress)}</em> cannot
                be found.
              </Typography>
            )}
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
