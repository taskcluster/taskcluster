import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import PlusIcon from 'mdi-react/PlusIcon';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import SecretsTable from '../../../components/SecretsTable';
import HelpView from '../../../components/HelpView';
import Button from '../../../components/Button';
import { VIEW_SECRETS_PAGE_SIZE } from '../../../utils/constants';
import ErrorPanel from '../../../components/ErrorPanel';
import secretsQuery from './secrets.graphql';

@hot(module)
@graphql(secretsQuery, {
  options: () => ({
    variables: {
      secretsConnection: {
        limit: VIEW_SECRETS_PAGE_SIZE,
      },
      filter: {
        name: { $regex: '' },
      },
    },
  }),
})
@withStyles(theme => ({
  plusIconSpan: {
    ...theme.mixins.fab,
  },
}))
export default class ViewSecrets extends Component {
  state = {
    secretSearch: '',
    value: null,
  };

  handleSecretSearchSubmit = secretSearch => {
    const {
      data: { refetch },
    } = this.props;

    this.setState({ secretSearch });

    refetch({
      secretsConnection: {
        limit: VIEW_SECRETS_PAGE_SIZE,
      },
      filter: {
        ...(secretSearch ? { $regex: secretSearch } : null),
      },
    });
  };

  handleCreate = () => {
    this.props.history.push('/secrets/create');
  };

  handlePageChange = ({ cursor, previousCursor }) => {
    const {
      data: { fetchMore },
    } = this.props;

    return fetchMore({
      query: secretsQuery,
      variables: {
        secretsConnection: {
          limit: VIEW_SECRETS_PAGE_SIZE,
          cursor,
          previousCursor,
        },
        ...(this.state.secretSearch
          ? {
              filter: {
                $regex: this.state.secretSearch,
              },
            }
          : null),
      },
      updateQuery(previousResult, { fetchMoreResult }) {
        const { edges, pageInfo } = fetchMoreResult.secrets;

        if (!edges.length) {
          return previousResult;
        }

        return dotProp.set(previousResult, 'secrets', secrets =>
          dotProp.set(
            dotProp.set(secrets, 'edges', edges),
            'pageInfo',
            pageInfo
          )
        );
      },
    });
  };

  handleSecretSearchChange = ({ target: { value } }) => {
    this.setState({ value });
  };

  render() {
    const {
      classes,
      description,
      data: { loading, error, secrets },
    } = this.props;
    const { value } = this.state;

    return (
      <Dashboard
        title="Secrets"
        helpView={<HelpView description={description} />}
        search={
          <Search
            disabled={loading}
            onSubmit={this.handleSecretSearchSubmit}
            onChange={this.handleSecretSearchChange}
            value={value}
            placeholder="Secret contains"
          />
        }>
        <Fragment>
          {loading && <Spinner loading />}
          <ErrorPanel error={error} />
          {secrets && (
            <SecretsTable
              onPageChange={this.handlePageChange}
              secretsConnection={secrets}
            />
          )}
          <Button
            spanProps={{ className: classes.plusIconSpan }}
            tooltipProps={{
              title: 'Create Secret',
              id: 'create-secret-tooltip',
              enterDelay: 300,
            }}
            onClick={this.handleCreate}
            variant="round"
            color="secondary">
            <PlusIcon />
          </Button>
        </Fragment>
      </Dashboard>
    );
  }
}
