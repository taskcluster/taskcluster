import { hot } from 'react-hot-loader';
import { PureComponent, Fragment } from 'react';
import { graphql } from 'react-apollo';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import PlusIcon from 'mdi-react/PlusIcon';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import Button from '../../../components/Button';
import RolesTable from '../../../components/RolesTable';
import HelpView from '../../../components/HelpView';
import rolesQuery from './roles.graphql';

@hot(module)
@graphql(rolesQuery)
@withStyles(theme => ({
  plusIcon: {
    ...theme.mixins.fab,
  },
}))
export default class ViewRoles extends PureComponent {
  state = {
    roleSearch: '',
  };

  handleRoleSearchChange = ({ target }) => {
    this.setState({ roleSearch: target.value });
  };

  handleCreate = () => {
    this.props.history.push('/auth/roles/create');
  };

  render() {
    const {
      classes,
      description,
      data: { loading, error, roles },
    } = this.props;
    const { roleSearch } = this.state;

    return (
      <Dashboard
        title="Roles"
        helpView={<HelpView description={description} />}
        search={
          <Search
            disabled={loading}
            value={roleSearch}
            onChange={this.handleRoleSearchChange}
            placeholder="Role starts with"
          />
        }>
        <Fragment>
          {!roles && loading && <Spinner loading />}
          {error && error.graphQLErrors && <ErrorPanel error={error} />}
          {roles && <RolesTable roles={roles} />}
          <Button
            onClick={this.handleCreate}
            variant="fab"
            color="secondary"
            className={classes.plusIcon}>
            <PlusIcon />
          </Button>
        </Fragment>
      </Dashboard>
    );
  }
}
