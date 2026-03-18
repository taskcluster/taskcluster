import { withStyles } from '@material-ui/core/styles';
import PlusIcon from 'mdi-react/PlusIcon';
import { parse, stringify } from 'qs';
import { PureComponent } from 'react';
import Button from '../../../components/Button';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
import Roles from './Roles';

@withStyles((theme) => ({
  plusIconSpan: {
    ...theme.mixins.fab,
  },
}))
export default class ViewRoles extends PureComponent {
  handleRoleSearchSubmit = (roleSearch) => {
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
        search={<Search onSubmit={this.handleRoleSearchSubmit} placeholder="Role contains" defaultValue={roleSearch} />}
      >
        <Roles searchTerm={roleSearch} />
        <Button
          spanProps={{ className: classes.plusIconSpan }}
          tooltipProps={{ title: 'Create Role' }}
          onClick={this.handleCreate}
          variant="round"
          color="secondary"
        >
          <PlusIcon />
        </Button>
      </Dashboard>
    );
  }
}
