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

  handleAddressDelete = async (notificationType, notificationAddress) => {
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

  render() {
    const { loading, error } = this.state;
    const {
      isNewAddress,
      data,
      match: { params },
    } = this.props;
    const hasDenylistAddresses =
      data &&
      data.listDenylistAddresses &&
      data.listDenylistAddresses.edges.length;

    return (
      <Dashboard
        title={isNewAddress ? 'Add Denylist Address' : 'Denylist Address'}>
        <ErrorPanel error={formatError(error)} />
        {isNewAddress ? (
          <DenylistForm
            loading={loading}
            isNewAddress
            onAddressAdd={this.handleAddressAdd}
          />
        ) : (
          <Fragment>
            {data.loading && <Spinner loading />}
            {data && <ErrorPanel error={data.error} />}
            {hasDenylistAddresses && (
              <DenylistForm
                loading={loading}
                address={data.listDenylistAddresses.edges[0].node}
                onAddressDelete={this.handleAddressDelete}
              />
            )}
            {!data.loading && !hasDenylistAddresses && (
              <Typography>
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
