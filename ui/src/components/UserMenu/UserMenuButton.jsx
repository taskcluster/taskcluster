import React, { Component, Fragment } from 'react';
import { withApollo } from 'react-apollo';
import Avatar from '@material-ui/core/Avatar';
import { withStyles } from '@material-ui/core/styles';
import IconButton from '@material-ui/core/IconButton';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import Button from '@material-ui/core/Button';
import AccountCircleIcon from 'mdi-react/AccountCircleIcon';
import SignInDialog from '../SignInDialog';
import { withAuth } from '../../utils/Auth';

@withStyles(theme => ({
  avatar: {
    backgroundColor: theme.palette.secondary.main,
  },
  icon: {
    fill: theme.palette.common.white,
  },
}))
@withAuth
@withApollo
export default class UserMenuButton extends Component {
  render() {
    const {
      classes,
      user,
      signInDialogOpen,
      onSignInDialogOpen,
      onSignInDialogClose,
      onMenuClick,
      ...props
    } = this.props;

    if (!user) {
      return (
        <Fragment component="nav">
          <Button
            variant="contained"
            color="primary"
            onClick={onSignInDialogOpen}
            {...props}>
            <ListItemIcon className={classes.icon}>
              <AccountCircleIcon />
            </ListItemIcon>
            Sign in
          </Button>
          <SignInDialog open={signInDialogOpen} onClose={onSignInDialogClose} />
        </Fragment>
      );
    }

    const { profile } = user;

    return (
      <IconButton
        button
        aria-haspopup="true"
        aria-controls="user-menu"
        aria-label="user menu"
        onClick={onMenuClick}>
        {profile.photos && profile.photos.length ? (
          <Avatar alt={profile.displayName} src={profile.photos[0].value} />
        ) : (
          <Avatar alt={profile.displayName}>{profile.displayName[0]}</Avatar>
        )}
      </IconButton>
    );
  }
}
