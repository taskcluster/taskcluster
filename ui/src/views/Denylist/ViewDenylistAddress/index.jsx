import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
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
  };

  handleDeleteAddress = async (notificationType, notificationAddress) => {
    this.setState({ error: null, loading: true });

    try {
      await this.props.client.mutate({
        mutation: deleteAddressQuery,
        variables: {
          address: {
            notificationAddress,
            notificationType,
          },
        },
      });

      this.setState({ error: null, loading: false });

      this.props.history.push(`/notify/denylist`);
    } catch (error) {
      this.setState({ error, loading: false });
    }
  };

  handleAddAddress = async (notificationType, notificationAddress) => {
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

      const url = `/notify/denylist/${encodeURIComponent(notificationAddress)}`;

      this.props.history.push(url);
    } catch (error) {
      this.setState({ error, loading: false });
    }
  };

  render() {
    const { loading, error } = this.state;
    const { isNewAddress, data } = this.props;

    return (
      <Dashboard title="Denylist Address">
        <ErrorPanel error={formatError(error)} />
        {isNewAddress ? (
          <DenylistForm
            loading={loading}
            isNewAddress
            onAddAddress={this.handleAddAddress}
          />
        ) : (
          <Fragment>
            {data.loading && <Spinner loading />}
            {data && <ErrorPanel error={data.error} />}
            {data && data.listDenylistAddresses && (
              <DenylistForm
                loading={loading}
                address={data.listDenylistAddresses.edges[0].node}
                onAddAddress={this.handleAddAddress}
                onDeleteAddress={this.handleDeleteAddress}
              />
            )}
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
