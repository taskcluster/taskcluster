import { hot } from 'react-hot-loader';
import { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import { withStyles } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import Tooltip from '@material-ui/core/Tooltip';
import Typography from '@material-ui/core/Typography';
import PlusIcon from 'mdi-react/PlusIcon';
import Dashboard from '../../../components/Dashboard';
import Spinner from '../../../components/Spinner';
import ErrorPanel from '../../../components/ErrorPanel';
import CachePurgesTable from '../../../components/CachePurgesTable';
import { VIEW_CACHE_PURGES_PAGE_SIZE } from '../../../utils/constants';
import cachePurgesQuery from './cachePurges.graphql';

@hot(module)
@graphql(cachePurgesQuery, {
  options: () => ({
    variables: {
      cachePurgesConnection: {
        limit: VIEW_CACHE_PURGES_PAGE_SIZE,
      },
    },
  }),
})
@withStyles(theme => ({
  plusIcon: {
    ...theme.mixins.fab,
  },
  description: {
    width: '80ch',
    marginBottom: theme.spacing.double,
  },
}))
export default class ViewCachePurges extends Component {
  handleCreate = () => {
    this.props.history.push('/purge-caches/create');
  };

  handlePageChange = ({ cursor, previousCursor }) => {
    const {
      data: { fetchMore },
    } = this.props;

    return fetchMore({
      query: cachePurgesQuery,
      variables: {
        cachePurgesConnection: {
          limit: VIEW_CACHE_PURGES_PAGE_SIZE,
          cursor,
          previousCursor,
        },
      },
      updateQuery(previousResult, { fetchMoreResult }) {
        const { edges, pageInfo } = fetchMoreResult.cachePurges;

        if (!edges.length) {
          return previousResult;
        }

        return dotProp.set(previousResult, 'cachePurges', cachePurges =>
          dotProp.set(
            dotProp.set(cachePurges, 'edges', edges),
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
      user,
      onSignIn,
      onSignOut,
      data: { loading, error, cachePurges },
    } = this.props;

    return (
      <Dashboard
        title="Cache Purges"
        user={user}
        onSignIn={onSignIn}
        onSignOut={onSignOut}>
        <Fragment>
          <Typography className={classes.description}>
            All currently active cache purges are displayed below. 24 hours
            after creation, requests expire and are no longer displayed here.
            The <strong>before</strong> column is the time at which any caches
            that match the previous three classifiers are considered invalid.
            Any caches created after that time are fine.
          </Typography>
          {!cachePurges && loading && <Spinner loading />}
          {error && error.graphQLErrors && <ErrorPanel error={error} />}
          {cachePurges && (
            <CachePurgesTable
              cachePurgesConnection={cachePurges}
              onPageChange={this.handlePageChange}
            />
          )}
          <Tooltip
            enterDelay={300}
            id="create-purge-cache-tooltip"
            title="Create Purge Cache Request">
            <Button
              onClick={this.handleCreate}
              variant="fab"
              color="secondary"
              className={classes.plusIcon}>
              <PlusIcon />
            </Button>
          </Tooltip>
        </Fragment>
      </Dashboard>
    );
  }
}
