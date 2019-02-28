import React, { Component, Fragment } from 'react';
import { withApollo } from 'react-apollo';
import Avatar from '@material-ui/core/Avatar';
import List from '@material-ui/core/List';
import { withStyles } from '@material-ui/core/styles';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import AccountCircleIcon from 'mdi-react/AccountCircleIcon';
import SignInDialog from '../SignInDialog';
import { withAuth } from '../../utils/Auth';

@withStyles(theme => ({
  avatar: {
    backgroundColor: theme.palette.secondary.main,
  },
  userMenu: {
    [theme.breakpoints.up('sm')]: {
      padding: `${theme.spacing.unit / 2}px ${theme.spacing.double}px`,
    },
  },
  text: {
    color: theme.palette.text.primary,
    fontFamily: 'Roboto500',
  },
  icon: {
    fill: theme.palette.text.primary,
  },
  username: {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
}))
@withAuth
@withApollo
export default class UserMenuList extends Component {
  render() {
    const {
      classes,
      user,
      signInDialogOpen,
      onSignInDialogOpen,
      onSignInDialogClose,
      onMenuClick,
    } = this.props;

    if (!user) {
      return (
        <List component="nav">
          <ListItem
            button
            aria-haspopup="true"
            aria-controls="user-menu"
            aria-label="user menu"
            onClick={onSignInDialogOpen}>
            <ListItemIcon className={classes.icon}>
              <AccountCircleIcon />
            </ListItemIcon>
            <ListItemText
              disableTypography
              className={classes.text}
              inset
              primary="Sign In"
            />
            <SignInDialog
              open={signInDialogOpen}
              onClose={onSignInDialogClose}
            />
          </ListItem>
        </List>
      );
    }

    const { profile } = user;

    return (
      <Fragment>
        <List component="nav">
          <ListItem
            className={classes.userMenu}
            button
            aria-haspopup="true"
            aria-controls="user-menu"
            aria-label="user menu"
            onClick={onMenuClick}>
            {profile.photos && profile.photos.length ? (
              <Avatar alt={profile.displayName} src={profile.photos[0].value} />
            ) : (
              <Avatar alt={profile.displayName}>
                {profile.displayName[0]}
              </Avatar>
            )}
            <ListItemText
              primary={profile.displayName}
              primaryTypographyProps={{ className: classes.username }}
              title={profile.displayName}
            />
          </ListItem>
        </List>
      </Fragment>
    );
  }
}
