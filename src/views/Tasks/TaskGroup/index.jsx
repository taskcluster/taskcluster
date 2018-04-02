import { hot } from 'react-hot-loader';
import { Component } from 'react';
import Typography from 'material-ui/Typography';
import Dashboard from '../../../components/Dashboard';

@hot(module)
export default class TaskGroup extends Component {
  render() {
    const { user, onSignIn, onSignOut } = this.props;

    return (
      <Dashboard user={user} onSignIn={onSignIn} onSignOut={onSignOut}>
        <Typography variant="display1">
          Hello, {user.nickname || user.name}!
        </Typography>
      </Dashboard>
    );
  }
}
