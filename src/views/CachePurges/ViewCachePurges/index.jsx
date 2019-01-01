import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import Tooltip from '@material-ui/core/Tooltip';
import Typography from '@material-ui/core/Typography';
import PlusIcon from 'mdi-react/PlusIcon';
import Dashboard from '../../../components/Dashboard';
import Button from '../../../components/Button';
import CachePurgesTable from '../../../components/CachePurgesTable';
import HelpView from '../../../components/HelpView';
import { VIEW_CACHE_PURGES_PAGE_SIZE } from '../../../utils/constants';
import ErrorPanel from '../../../components/ErrorPanel';
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
      description,
      data: { loading, error, cachePurges },
    } = this.props;

    return (
      <Dashboard
        helpView={
          <HelpView description={description}>
            <Typography>
              All currently active cache purges are displayed below. 24 hours
              after creation, requests expire and are no longer displayed here.
              The <strong>before</strong> column is the time at which any caches
              that match the previous three classifiers are considered invalid.
              Any caches created after that time are fine.
            </Typography>
          </HelpView>
        }
        title="Cache Purges">
        <Fragment>
          {!cachePurges && loading && <Spinner loading />}
          <ErrorPanel error={error} />
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
              variant="round"
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
