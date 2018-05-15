import { hot } from 'react-hot-loader';
import { PureComponent, Fragment } from 'react';
import { graphql } from 'react-apollo';
import { withStyles } from 'material-ui/styles';
import Button from 'material-ui/Button';
import PlusIcon from 'mdi-react/PlusIcon';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import Spinner from '../../../components/Spinner';
import ErrorPanel from '../../../components/ErrorPanel';
import RolesTable from '../../../components/RolesTable';
import rolesQuery from './roles.graphql';

@hot(module)
@graphql(rolesQuery)
@withStyles(theme => ({
  plusIcon: {
    position: 'fixed',
    bottom: theme.spacing.double,
    right: theme.spacing.triple,
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
      user,
      onSignIn,
      onSignOut,
      data: { loading, error, roles },
    } = this.props;
    const { roleSearch } = this.state;

    return (
      <Dashboard
        title="Roles"
        search={
          <Search
            disabled={loading}
            value={roleSearch}
            onChange={this.handleRoleSearchChange}
            placeholder="Role starts with"
          />
        }
        user={user}
        onSignIn={onSignIn}
        onSignOut={onSignOut}>
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
