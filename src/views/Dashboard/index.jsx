import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { Link } from 'react-router-dom';
import { withStyles } from 'material-ui/styles';
import Button from 'material-ui/Button';
import Typography from 'material-ui/Typography';
import HexagonMultipleIcon from 'mdi-react/HexagonMultipleIcon';
import PlusCircleIcon from 'mdi-react/PlusCircleIcon';
import LibraryIcon from 'mdi-react/LibraryIcon';
import Dashboard from '../../components/Dashboard';

@hot(module)
@withStyles(theme => ({
  buttonIcon: {
    marginRight: theme.spacing.double,
  },
}))
export default class DashboardView extends Component {
  render() {
    const { classes, user, onSignIn, onSignOut } = this.props;

    return (
      <Dashboard user={user} onSignIn={onSignIn} onSignOut={onSignOut}>
        <Typography variant="display1">
          Hello, {user.nickname || user.name}!
        </Typography>
        <br />
        <br />

        <Button component={Link} to="/tasks/groups">
          <HexagonMultipleIcon className={classes.buttonIcon} />
          I want to look at a task or group of tasks.
        </Button>
        <br />
        <br />

        <Button component={Link} to="/tasks/new">
          <PlusCircleIcon className={classes.buttonIcon} />
          I want to create a task or build.
        </Button>
        <br />
        <br />

        <Button component={Link} to="/docs">
          <LibraryIcon className={classes.buttonIcon} />
          I want to see documentation.
        </Button>
      </Dashboard>
    );
  }
}
