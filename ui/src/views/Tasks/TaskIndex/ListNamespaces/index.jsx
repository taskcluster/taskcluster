import { Redirect } from 'react-router-dom';
import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import { defaultTo } from 'ramda';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Typography from '@material-ui/core/Typography';
import Dashboard from '../../../../components/Dashboard';
import HelpView from '../../../../components/HelpView';
import Search from '../../../../components/Search';
import IndexNamespacesTable from '../../../../components/IndexNamespacesTable';
import IndexTaskNamespaceTable from '../../../../components/IndexTaskNamespaceTable';
import { VIEW_NAMESPACES_PAGE_SIZE } from '../../../../utils/constants';
import ErrorPanel from '../../../../components/ErrorPanel';
import namespacesQuery from './namespaces.graphql';
import taskNamespaceQuery from '../taskNamespace.graphql';

const defaultEmpty = defaultTo('');

@hot(module)
@withApollo
@graphql(namespacesQuery, {
  name: 'namespacesData',
  options: props => ({
    variables: {
      namespace: defaultEmpty(props.match.params.namespace),
      namespaceConnection: {
        limit: VIEW_NAMESPACES_PAGE_SIZE,
      },
    },
  }),
})
@graphql(taskNamespaceQuery, {
  name: 'taskNamespaceData',
  options: props => ({
    variables: {
      namespace: defaultEmpty(props.match.params.namespace),
      taskConnection: {
        limit: VIEW_NAMESPACES_PAGE_SIZE,
      },
    },
  }),
})
export default class ListNamespaces extends Component {
  state = {
    indexPathInput: this.props.match.params.namespace
      ? this.props.match.params.namespace
      : '',
  };

  componentDidUpdate(prevProps) {
    if (
      prevProps.match.params.namespace !== this.props.match.params.namespace
    ) {
      this.loadNamespace(this.props);
    }
  }

  async loadNamespace() {
    this.props.match.params.namespace
      ? this.setState({ indexPathInput: this.props.match.params.namespace })
      : this.setState({ indexPathInput: '' });
  }

  handleNamespacesPageChange = ({ cursor, previousCursor }) => {
    const {
      match: {
        params: { namespace },
      },
      namespacesData: { fetchMore },
    } = this.props;

    return fetchMore({
      query: namespacesQuery,
      variables: {
        namespace: defaultEmpty(namespace),
        namespaceConnection: {
          limit: VIEW_NAMESPACES_PAGE_SIZE,
          cursor,
          previousCursor,
        },
      },
      updateQuery(previousResult, { fetchMoreResult }) {
        const { edges, pageInfo } = fetchMoreResult.namespaces;

        if (!edges.length) {
          return previousResult;
        }

        return dotProp.set(previousResult, 'namespaces', namespaces =>
          dotProp.set(
            dotProp.set(namespaces, 'edges', edges),
            'pageInfo',
            pageInfo
          )
        );
      },
    });
  };

  handleTaskNamespacePageChange = ({ cursor, previousCursor }) => {
    const {
      match: {
        params: { namespace },
      },
      taskNamespaceData: { fetchMore },
    } = this.props;

    return fetchMore({
      query: taskNamespaceQuery,
      variables: {
        namespace: defaultEmpty(namespace),
        taskConnection: {
          limit: VIEW_NAMESPACES_PAGE_SIZE,
          cursor,
          previousCursor,
        },
      },
      updateQuery(previousResult, { fetchMoreResult }) {
        const { edges, pageInfo } = fetchMoreResult.taskNamespace;

        if (!edges.length) {
          return previousResult;
        }

        return dotProp.set(previousResult, 'taskNamespace', namespaces =>
          dotProp.set(
            dotProp.set(namespaces, 'edges', edges),
            'pageInfo',
            pageInfo
          )
        );
      },
    });
  };

  handleIndexPathInputChange = e => {
    this.setState({ indexPathInput: e.target.value });
  };

  handleIndexPathSearchSubmit = () => {
    this.props.history.replace(`/tasks/index/${this.state.indexPathInput}`);
  };

  render() {
    const {
      namespacesData: {
        namespaces,
        loading: namespacesLoading,
        error: namespacesError,
      },
      taskNamespaceData: {
        taskNamespace,
        loading: taskNamespaceLoading,
        error: taskNamespaceError,
      },
      description,
    } = this.props;
    const { indexPathInput } = this.state;
    const hasIndexedTasks =
      taskNamespace && taskNamespace.edges && taskNamespace.edges.length > 0;
    const hasNamespaces =
      namespaces && namespaces.edges && namespaces.edges.length > 0;
    const loading = namespacesLoading || taskNamespaceLoading;
    const isSinglePath = indexPathInput.split('.').length === 1;

    return (
      <Dashboard
        title="Task Index"
        helpView={<HelpView description={description} />}
        search={
          <Search
            disabled={loading}
            value={indexPathInput}
            onChange={this.handleIndexPathInputChange}
            onSubmit={this.handleIndexPathSearchSubmit}
            placeholder="Search path.to.index"
          />
        }>
        <Fragment>
          {loading && <Spinner loading />}
          <ErrorPanel fixed error={namespacesError || taskNamespaceError} />
          {!loading && !hasNamespaces && !hasIndexedTasks && !isSinglePath && (
            <Redirect
              to={`/tasks/index/${indexPathInput
                .split('.')
                .slice(0, -1)
                .join('.')}/${indexPathInput.split('.').slice(-1)[0]}`}
            />
          )}
          {!loading && !hasNamespaces && !hasIndexedTasks && isSinglePath && (
            <Typography variant="body2">No items for this page.</Typography>
          )}
          {!loading && hasNamespaces && (
            <Fragment>
              <Typography variant="subtitle1">Namespaces</Typography>
              <IndexNamespacesTable
                onPageChange={this.handleNamespacesPageChange}
                connection={namespaces}
              />
            </Fragment>
          )}
          {!loading && hasIndexedTasks && (
            <Fragment>
              <Typography variant="subtitle1">Indexed Tasks</Typography>
              <IndexTaskNamespaceTable
                onPageChange={this.handleTaskNamespacePageChange}
                connection={taskNamespace}
              />
            </Fragment>
          )}
        </Fragment>
      </Dashboard>
    );
  }
}
