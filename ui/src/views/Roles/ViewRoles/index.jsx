import { hot } from 'react-hot-loader';
import React, { PureComponent } from 'react';
import { parse, stringify } from 'qs';
import { withStyles } from '@material-ui/core/styles';
import PlusIcon from 'mdi-react/PlusIcon';
import Roles from './Roles';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import Button from '../../../components/Button';
import HelpView from '../../../components/HelpView';

@hot(module)
@withStyles(theme => ({
  plusIconSpan: {
    ...theme.mixins.fab,
  },
}))
export default class ViewRoles extends PureComponent {
  state = {
    roleSearch: this.props.history.location.search
      ? parse(this.props.history.location.search.slice(1)).roleSearch
      : '',
  };

  handleRoleSearchSubmit = roleSearch => {
    if (roleSearch !== this.state.roleSearch) {
      this.props.history.push(
        roleSearch.length > 0 ? `?${stringify({ roleSearch })}` : '/auth/roles'
      );
    }

    this.setState({ roleSearch });
  };

  handleCreate = () => {
    this.props.history.push('/auth/roles/create');
  };

  render() {
    const { classes, description } = this.props;
    const { roleSearch } = this.state;

    return (
      <Dashboard
        title="Roles"
        helpView={<HelpView description={description} />}
        search={
          <Search
            onSubmit={this.handleRoleSearchSubmit}
            placeholder="Role contains"
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
