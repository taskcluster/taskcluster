import React, { PureComponent, Fragment } from 'react';
import { hot } from 'react-hot-loader';
import { graphql } from 'react-apollo';
import { parse, stringify } from 'qs';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import PlusIcon from 'mdi-react/PlusIcon';
import dotProp from 'dot-prop-immutable';
import escapeStringRegexp from 'escape-string-regexp';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import HelpView from '../../../components/HelpView';
import Button from '../../../components/Button';
import ClientsTable from '../../../components/ClientsTable';
import { VIEW_CLIENTS_PAGE_SIZE } from '../../../utils/constants';
import clientsQuery from './clients.graphql';
import ErrorPanel from '../../../components/ErrorPanel';

@hot(module)
@graphql(clientsQuery, {
  options: props => ({
    variables: {
      clientOptions: null,
      clientsConnection: {
        limit: VIEW_CLIENTS_PAGE_SIZE,
      },
      filter: props.history.location.search
        ? {
            clientId: {
              $regex: escapeStringRegexp(
                parse(props.history.location.search.slice(1)).search
              ),
              $options: 'i',
            },
          }
        : null,
    },
  }),
})
@withStyles(theme => ({
  plusIcon: {
    ...theme.mixins.fab,
  },
}))
export default class ViewClients extends PureComponent {
  handleClientSearchSubmit = async search => {
    const {
      data: { refetch },
    } = this.props;
    const searchUri = this.props.history.location.search
      ? parse(this.props.history.location.search.slice(1)).search
      : '';

    await refetch({
      clientOptions: null,
      clientsConnection: {
        limit: VIEW_CLIENTS_PAGE_SIZE,
      },
      filter: search
        ? { clientId: { $regex: escapeStringRegexp(search), $options: 'i' } }
        : null,
    });

    if (search !== searchUri) {
      this.props.history.push(
        search.length > 0 ? `?${stringify({ search })}` : '/auth/clients'
      );
    }
  };

  handleCreate = () => {
    this.props.history.push('/auth/clients/create');
  };

  handlePageChange = ({ cursor, previousCursor }) => {
    const {
      data: { fetchMore },
      history,
    } = this.props;

    return fetchMore({
      query: clientsQuery,
      variables: {
        clientsConnection: {
          limit: VIEW_CLIENTS_PAGE_SIZE,
          cursor,
          previousCursor,
        },
        clientOptions: null,
        ...(history.location.search
          ? {
              filter: {
                clientId: {
                  $regex: escapeStringRegexp(
                    parse(history.location.search.slice(1)).search
                  ),
                  $options: 'i',
                },
              },
            }
          : null),
      },
      updateQuery(previousResult, { fetchMoreResult }) {
        const { edges, pageInfo } = fetchMoreResult.clients;

        return dotProp.set(previousResult, 'clients', clients =>
          dotProp.set(
            dotProp.set(clients, 'edges', edges),
            'pageInfo',
            pageInfo
          )
        );
      },
    });
  };

  render() {
    const {
      classes,
      description,
      data: { loading, error, clients },
    } = this.props;

    return (
      <Dashboard
        title="Clients"
        helpView={<HelpView description={description} />}
        search={
          <Search
            disabled={loading}
            onSubmit={this.handleClientSearchSubmit}
            placeholder="Client contains"
          />
        }>
        <Fragment>
          {loading && <Spinner loading />}
          <ErrorPanel fixed error={error} />
          {clients && (
            <ClientsTable
              onPageChange={this.handlePageChange}
              clientsConnection={clients}
            />
          )}
          <Button
            onClick={this.handleCreate}
            variant="round"
            color="secondary"
            className={classes.plusIcon}>
            <PlusIcon />
          </Button>
        </Fragment>
      </Dashboard>
    );
  }
}
