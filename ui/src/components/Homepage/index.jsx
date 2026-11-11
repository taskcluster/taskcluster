import React, { Component } from 'react';
import classNames from 'classnames';
import withStyles from '@mui/styles/withStyles';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import AccountCircleIcon from 'mdi-react/AccountCircleIcon';
import Button from '../Button';
import Landing from '../Landing';
import SignInDialog from '../SignInDialog';

@withStyles(theme => ({
  root: {
    padding: theme.spacing(10),
    [theme.breakpoints.down('md')]: {
      padding: theme.spacing(5),
    },
  },
  headline: {
    fontFamily: 'Roboto',
    fontWeight: 500,
    [theme.breakpoints.down('md')]: {
      marginBottom: theme.spacing(2),
      fontSize: 40,
    },
  },
  largeHeadline: {
    display: 'none',
    [theme.breakpoints.up('sm')]: {
      display: 'block',
    },
  },
  smallHeadline: {
    [theme.breakpoints.up('sm')]: {
      display: 'none',
    },
  },
  actions: {
    marginTop: theme.spacing(3),
  },
  divider: {
    margin: `${theme.spacing(10)} 0 ${theme.spacing(3)}`,
    [theme.breakpoints.down('md')]: {
      margin: `${theme.spacing(5)} 0 ${theme.spacing(2)}`,
    },
  },
  icon: {
    fill: theme.palette.common.white,
    marginRight: theme.spacing(1),
  },
  ciDescription: {
    [theme.breakpoints.down('md')]: {
      fontSize: 16,
    },
  },
}))
export default class HomePage extends Component {
  state = {
    signInDialogOpen: false,
  };

  handleCloseSignInDialog = () => {
    this.setState({ signInDialogOpen: false });
  };

  handleOpenSignInDialog = () => {
    this.setState({ signInDialogOpen: true });
  };

  render() {
    const { classes } = this.props;
    const { signInDialogOpen } = this.state;

    return (
      <Landing className={classes.root}>
        <Typography
          variant="h1"
          className={classNames(classes.headline, classes.largeHeadline)}>
          {window.env.APPLICATION_NAME}
        </Typography>
        <Typography
          variant="h2"
          className={classNames(classes.headline, classes.smallHeadline)}>
          {window.env.APPLICATION_NAME}
        </Typography>
        <Typography variant="h5" className={classes.ciDescription}>
          A task execution framework that supports Mozilla&apos;s continuous
          integration and release processes.
        </Typography>
        <Divider className={classes.divider} />
        <div className={classes.actions}>
          <Button
            variant="contained"
            color="secondary"
            onClick={this.handleOpenSignInDialog}>
            <AccountCircleIcon className={classes.icon} />
            Sign in
          </Button>
          <SignInDialog
            open={signInDialogOpen}
            onClose={this.handleCloseSignInDialog}
          />
        </div>
      </Landing>
    );
  }
}
