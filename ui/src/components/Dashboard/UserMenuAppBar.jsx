import React, { Component, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { withApollo } from 'react-apollo';
import { withStyles } from '@material-ui/core/styles';
import Avatar from '@material-ui/core/Avatar';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import List from '@material-ui/core/List';
import IconButton from '@material-ui/core/IconButton';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import Button from '@material-ui/core/Button';
import AccountCircleIcon from 'mdi-react/AccountCircleIcon';
import AccountIcon from 'mdi-react/AccountIcon';
import HandPeaceIcon from 'mdi-react/HandPeaceIcon';
import { withAuth } from '../../utils/Auth';
import SignInDialog from '../SignInDialog';

@withStyles(theme => ({
  avatar: {
    backgroundColor: theme.palette.secondary.main,
  },
  text: {
    color: theme.palette.text.primary,
    fontFamily: 'Roboto500',
  },
  icon: {
    fill: theme.palette.common.white,
    marginRight: theme.spacing.unit,
    marginLeft: theme.spacing.unit,
  },
  leftIcon: {
    marginRight: theme.spacing.unit,
  },
}))
@withAuth
@withApollo
export default class UserMenuAppBar extends Component {
  state = {
    anchorEl: null,
    signInDialogOpen: false,
  };

  handleClickSignOut = () => {
    this.handleMenuClose();
    this.props.onUnauthorize();
    // Since Apollo caches query results, it’s important to get rid of them
    // when the login state changes.
    this.props.client.clearStore();
  };

  handleMenuClick = e => {
    this.setState({ anchorEl: e.currentTarget });
  };

  handleMenuClose = () => {
    this.setState({ anchorEl: null });
  };

  handleSignInDialogClose = () => {
    this.setState({ signInDialogOpen: false });
  };

  handleSignInDialogOpen = () => {
    this.setState({ signInDialogOpen: true });
  };

  render() {
    const { classes, user } = this.props;
    const { anchorEl, signInDialogOpen } = this.state;

    if (!user) {
      return (
        <List component="nav">
          <Button
            variant="contained"
            color="primary"
            onClick={this.handleSignInDialogOpen}>
            <ListItemIcon className={classes.icon}>
              <AccountCircleIcon />
            </ListItemIcon>
            Sign in
          </Button>
          <SignInDialog
            open={signInDialogOpen}
            onClose={this.handleSignInDialogClose}
          />
        </List>
      );
    }

    const { profile } = user;

    return (
      <Fragment>
        <List component="nav">
          <IconButton
            button
            aria-haspopup="true"
            aria-controls="user-menu"
            aria-label="user menu"
            onClick={this.handleMenuClick}>
            {profile.photos && profile.photos.length ? (
              <Avatar alt={profile.displayName} src={profile.photos[0].value} />
            ) : (
              <Avatar alt={profile.displayName}>
                {profile.displayName[0]}
              </Avatar>
            )}
          </IconButton>
        </List>
        <Menu
          id="user-menu"
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={this.handleMenuClose}>
          <MenuItem title="Your Profile" component={Link} to="/profile">
            <AccountIcon className={classes.leftIcon} />
            Account
          </MenuItem>
          <MenuItem
            title={`Sign Out of ${process.env.APPLICATION_NAME}`}
            onClick={this.handleClickSignOut}>
            <HandPeaceIcon className={classes.leftIcon} />
            Sign Out
          </MenuItem>
        </Menu>
      </Fragment>
    );
  }
}
