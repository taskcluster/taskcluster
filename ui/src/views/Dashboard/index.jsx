import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import HexagonMultipleIcon from 'mdi-react/HexagonMultipleIcon';
import HexagonIcon from 'mdi-react/HexagonIcon';
import PlusCircleIcon from 'mdi-react/PlusCircleIcon';
import LibraryIcon from 'mdi-react/LibraryIcon';
import { Divider, Grid } from '@material-ui/core';
import Dashboard from '../../components/Dashboard';
import Button from '../../components/Button';
import { withAuth } from '../../utils/Auth';
import { DOCS_PATH_PREFIX } from '../../utils/constants';
import Link from '../../utils/Link';
import StatsFetcher from '../../components/StatusDashboard/StatsFetcher';

@withStyles(theme => ({
  buttonIcon: {
    marginRight: theme.spacing(2),
  },
  link: {
    display: 'block',
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
}))
@withAuth
export default class DashboardView extends Component {
  render() {
    const { classes, user } = this.props;

    return (
      <Dashboard>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Typography variant="h4" className={classes.title}>
              Hello, {user.profile.displayName}!
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6} lg={3}>
            <Link to="/tasks" className={classes.link}>
              <Button>
                <HexagonIcon className={classes.buttonIcon} />I want to look at
                a task.
              </Button>
            </Link>
          </Grid>
          <Grid item xs={12} sm={6} lg={3}>
            <Link to="/tasks/groups" className={classes.link}>
              <Button>
                <HexagonMultipleIcon className={classes.buttonIcon} />I want to
                look at a group of tasks.
              </Button>
            </Link>
          </Grid>
          <Grid item xs={12} sm={6} lg={3}>
            <Link to="/tasks/create" className={classes.link}>
              <Button>
                <PlusCircleIcon className={classes.buttonIcon} />I want to
                create a task or build.
              </Button>
            </Link>
          </Grid>
          <Grid item xs={12} sm={6} lg={3}>
            <Link to={DOCS_PATH_PREFIX} className={classes.link}>
              <Button>
                <LibraryIcon className={classes.buttonIcon} />I want to see
                documentation.
              </Button>
            </Link>
          </Grid>
        </Grid>

        <Divider />
        <StatsFetcher />
      </Dashboard>
    );
  }
}
