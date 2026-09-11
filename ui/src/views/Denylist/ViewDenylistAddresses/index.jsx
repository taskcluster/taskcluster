import React, { Component } from 'react';
import { Notify } from '@taskcluster/client-web';
import { withStyles } from '@material-ui/core/styles';
import PlusIcon from 'mdi-react/PlusIcon';
import qs from 'qs';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import Button from '../../../components/Button';
import HelpView from '../../../components/HelpView';
import ErrorPanel from '../../../components/ErrorPanel';
import DenylistTable from '../../../components/DenylistTable';
import withPaginatedResource from '../../../hocs/withPaginatedResource';
import { VIEW_DENYLIST_PAGE_SIZE } from '../../../utils/constants';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';

@withStyles(theme => ({
  plusIconSpan: {
    ...theme.mixins.fab,
  },
}))
@withTaskclusterClient
@withPaginatedResource({
  fetch: props => options =>
    props.createTaskclusterClient({ Class: Notify }).listDenylist(options),
  payload: { limit: VIEW_DENYLIST_PAGE_SIZE },
  select: response => response.addresses,
})
export default class ViewDenylist extends Component {
  get searchTerm() {
    return qs.parse(this.props.location.search.slice(1)).search || null;
  }

  handleSearchSubmit = addressSearch => {
    const { history, location, reload } = this.props;

    if ((addressSearch || null) === this.searchTerm) {
      reload();

      return;
    }

    history.push({
      search: qs.stringify({
        ...qs.parse(location.search.slice(1)),
        search: addressSearch,
      }),
    });
  };

  handleAddressAdd = () => {
    this.props.history.push('/notify/denylist/add');
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
    const { searchTerm } = this;
    // The service has no server-side search, so the term refines the page in
    // hand -- the same thing the GraphQL layer used to do.
    const addresses = searchTerm
      ? items.filter(({ notificationAddress }) =>
          notificationAddress.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : items;
    const initialLoad = loading && !items.length;

    return (
      <Dashboard
        title="Denylist Addresses"
        helpView={<HelpView description={description} />}
        search={
          <Search
            defaultValue={searchTerm}
            onSubmit={this.handleSearchSubmit}
            placeholder="Address contains"
          />
        }>
        {initialLoad && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {!initialLoad && (
          <DenylistTable
            addresses={addresses}
            searchTerm={searchTerm}
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
          tooltipProps={{ title: 'Add Address' }}
          onClick={this.handleAddressAdd}
          variant="circular"
          color="secondary">
          <PlusIcon />
        </Button>
      </Dashboard>
    );
  }
}
