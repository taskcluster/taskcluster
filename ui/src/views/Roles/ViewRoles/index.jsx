import React, { PureComponent } from 'react';
import { parse, stringify } from 'qs';
import { withStyles } from '@material-ui/core/styles';
import PlusIcon from 'mdi-react/PlusIcon';
import Roles from './Roles';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import Button from '../../../components/Button';
import HelpView from '../../../components/HelpView';

@withStyles(theme => ({
  plusIconSpan: {
    ...theme.mixins.fab,
  },
}))
export default class ViewRoles extends PureComponent {
  handleRoleSearchSubmit = roleSearch => {
    const { location, history } = this.props;
    const query = parse(location.search.slice(1));

    if (query.search !== roleSearch) {
      const newQuery = {
        ...query,
        search: roleSearch,
      };

      history.push({
        search: stringify(newQuery, { addQueryPrefix: true }),
      });
    }
  };

  handleCreate = () => {
    this.props.history.push('/auth/roles/create');
  };

  render() {
    const { classes, description, location } = this.props;
    const query = parse(location.search.slice(1));
    const roleSearch = query.search ? query.search : '';

    return (
      <Dashboard
        title="Roles"
        helpView={<HelpView description={description} />}
        search={
          <Search
            onSubmit={this.handleRoleSearchSubmit}
            placeholder="Role contains"
            defaultValue={roleSearch}
          />
        }>
        <Roles searchTerm={roleSearch} />
        <Button
          spanProps={{ className: classes.plusIconSpan }}
          tooltipProps={{ title: 'Create Role' }}
          onClick={this.handleCreate}
          variant="round"
          color="secondary">
          <PlusIcon />
        </Button>
      </Dashboard>
    );
  }
}
