import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { Link } from 'react-router-dom';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import HexagonMultipleIcon from 'mdi-react/HexagonMultipleIcon';
import PlusCircleIcon from 'mdi-react/PlusCircleIcon';
import LibraryIcon from 'mdi-react/LibraryIcon';
import Dashboard from '../../components/Dashboard';
import Button from '../../components/Button';
import { withAuth } from '../../utils/Auth';

@hot(module)
@withStyles(theme => ({
  buttonIcon: {
    marginRight: theme.spacing.double,
  },
}))
@withAuth
export default class DashboardView extends Component {
  render() {
    const { classes, user } = this.props;

    return (
      <Dashboard>
        <Typography variant="display1">
          Hello, {user.profile.displayName}!
        </Typography>
        <br />
        <br />

        <Button component={Link} to="/tasks/groups">
          <HexagonMultipleIcon className={classes.buttonIcon} />
          I want to look at a task or group of tasks.
        </Button>
        <br />
        <br />

        <Button component={Link} to="/tasks/create">
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
