import { hot } from 'react-hot-loader';
import React, { PureComponent, Fragment } from 'react';
import { graphql } from 'react-apollo';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import PlusIcon from 'mdi-react/PlusIcon';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import Button from '../../../components/Button';
import RolesTable from '../../../components/RolesTable';
import HelpView from '../../../components/HelpView';
import ErrorPanel from '../../../components/ErrorPanel';
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
    roleSearchText: '',
  };

  handleCreate = () => {
    this.props.history.push('/auth/roles/create');
  };

  handleRoleSearchChange = ({ target }) => {
    this.setState({ roleSearchText: target.value });
  };

  handleRoleSearchSubmit = e => {
    e.preventDefault();

    this.setState({ roleSearch: this.state.roleSearchText });
  };

  render() {
    const {
      classes,
      description,
      data: { loading, error, roles },
    } = this.props;
    const { roleSearch, roleSearchText } = this.state;

    return (
      <Dashboard
        title="Roles"
        helpView={<HelpView description={description} />}
        search={
          <Search
            disabled={loading}
            value={roleSearchText}
            onChange={this.handleRoleSearchChange}
            onSubmit={this.handleRoleSearchSubmit}
            placeholder="Role contains"
          />
        }
      >
        <Fragment>
          {!roles && loading && <Spinner loading />}
          <ErrorPanel error={error} />
          {roles && <RolesTable searchTerm={roleSearch} roles={roles} />}
          <Button
            onClick={this.handleCreate}
            variant="fab"
            color="secondary"
            className={classes.plusIcon}
          >
            <PlusIcon />
          </Button>
        </Fragment>
      </Dashboard>
    );
  }
}
