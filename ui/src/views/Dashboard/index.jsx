import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import HexagonMultipleIcon from 'mdi-react/HexagonMultipleIcon';
import HexagonIcon from 'mdi-react/HexagonIcon';
import PlusCircleIcon from 'mdi-react/PlusCircleIcon';
import LibraryIcon from 'mdi-react/LibraryIcon';
import Dashboard from '../../components/Dashboard';
import Button from '../../components/Button';
import { withAuth } from '../../utils/Auth';
import { DOCS_PATH_PREFIX } from '../../utils/constants';
import Link from '../../utils/Link';

@hot(module)
@withStyles(theme => ({
  buttonIcon: {
    marginRight: theme.spacing(2),
  },
}))
@withAuth
export default class DashboardView extends Component {
  render() {
    const { classes, user } = this.props;

    return (
      <Dashboard>
        <Typography variant="h4">Hello, {user.profile.displayName}!</Typography>
        <br />
        <br />
        <Link to="/tasks">
          <Button>
            <HexagonIcon className={classes.buttonIcon} />I want to look at a
            task.
          </Button>
        </Link>
        <br />
        <br />
        <Link to="/tasks/groups">
          <Button>
            <HexagonMultipleIcon className={classes.buttonIcon} />I want to look
            at a group of tasks.
          </Button>
        </Link>
        <br />
        <br />
        <Link to="/tasks/create">
          <Button>
            <PlusCircleIcon className={classes.buttonIcon} />I want to create a
            task or build.
          </Button>
        </Link>
        <br />
        <br />
        <Link to={DOCS_PATH_PREFIX}>
          <Button>
            <LibraryIcon className={classes.buttonIcon} />I want to see
            documentation.
          </Button>
        </Link>
      </Dashboard>
    );
  }
}
