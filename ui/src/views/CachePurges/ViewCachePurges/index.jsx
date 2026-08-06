import React, { Component } from 'react';
import { PurgeCache } from '@taskcluster/client-web';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import PlusIcon from 'mdi-react/PlusIcon';
import qs, { parse, stringify } from 'qs';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import Button from '../../../components/Button';
import CachePurgesTable from '../../../components/CachePurgesTable';
import HelpView from '../../../components/HelpView';
import { VIEW_CACHE_PURGES_PAGE_SIZE } from '../../../utils/constants';
import ErrorPanel from '../../../components/ErrorPanel';
import Search from '../../../components/Search';
import withPaginatedResource from '../../../hocs/withPaginatedResource';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';

@withStyles(theme => ({
  plusIconSpan: {
    ...theme.mixins.fab,
  },
}))
@withTaskclusterClient
@withPaginatedResource({
  fetch: props => options =>
    props
      .createTaskclusterClient({ Class: PurgeCache })
      .allPurgeRequests(options),
  payload: { limit: VIEW_CACHE_PURGES_PAGE_SIZE },
  select: r => r.requests,
})
export default class ViewCachePurges extends Component {
  handleCreate = () => {
    this.props.history.push('/purge-caches/create');
  };

  handlePurgeCacheSubmit = cacheSearch => {
    const query = parse(window.location.search.slice(1));

    this.props.history.push({
      search: stringify({
        ...query,
        search: cacheSearch,
      }),
    });
  };

  render() {
    const {
      classes,
      description,
      items,
      loading,
      error,
      page,
      hasNextPage,
      hasPreviousPage,
      nextPage,
      previousPage,
    } = this.props;
    const query = qs.parse(this.props.location.search.slice(1));
    const cacheSearch = query.search;
    const initialLoad = loading && !items.length;

    return (
      <Dashboard
        helpView={
          <HelpView description={description}>
            <Typography variant="body2">
              All currently active cache purges are displayed below. 24 hours
              after creation, requests expire and are no longer displayed here.
              The <strong>before</strong> column is the time at which any caches
              that match the previous three classifiers are considered invalid.
              Any caches created after that time are fine.
            </Typography>
          </HelpView>
        }
        title="Purge Caches"
        search={
          <Search
            disabled={loading}
            defaultValue={cacheSearch}
            onSubmit={this.handlePurgeCacheSubmit}
            placeholder="Cache Name contains"
          />
        }>
        {initialLoad && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {!initialLoad && (
          <CachePurgesTable
            searchTerm={cacheSearch}
            cachePurges={items}
            loading={loading}
            page={page}
            hasNextPage={hasNextPage}
            hasPreviousPage={hasPreviousPage}
            onNextPage={nextPage}
            onPreviousPage={previousPage}
          />
        )}
        <Button
          spanProps={{ className: classes.plusIconSpan }}
          tooltipProps={{
            title: 'Create Purge Cache Request',
            id: 'create-purge-cache-tooltip',
            delay: 300,
          }}
          onClick={this.handleCreate}
          variant="circular"
          color="secondary">
          <PlusIcon />
        </Button>
      </Dashboard>
    );
  }
}
