import React, { Component, Fragment } from 'react';
import Avatar from '@mui/material/Avatar';
import List from '@mui/material/List';
import withStyles from '../../utils/withStyles';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import AccountCircleIcon from 'mdi-react/AccountCircleIcon';
import SignInDialog from '../SignInDialog';
import { withAuth } from '../../utils/Auth';
import getPictureFromUser from '../../utils/getPictureFromUser';
import username from '../../utils/username';

@withAuth
@withStyles(theme => ({
  avatar: {
    backgroundColor: theme.palette.secondary.main,
  },
  userMenu: {
    [theme.breakpoints.up('sm')]: {
      padding: `${theme.spacing(0.5)} ${theme.spacing(2)}`,
    },
  },
  text: {
    color: theme.palette.text.primary,
    fontFamily: 'Roboto',
    fontWeight: 500,
  },
  icon: {
    fill: theme.palette.text.primary,
  },
  username: {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    paddingLeft: theme.spacing(2),
  },
}))
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
    const avatarSrc = getPictureFromUser(user);

    if (!user) {
      return (
        <Fragment>
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
                primaryTypographyProps={{
                  variant: 'body1',
                  className: classes.text,
                }}
                primary="Sign In"
              />
            </ListItem>
          </List>
          <SignInDialog open={signInDialogOpen} onClose={onSignInDialogClose} />
        </Fragment>
      );
    }

    const profileName = username(user);

    return (
      <List component="nav">
        <ListItem
          className={classes.userMenu}
          button
          aria-haspopup="true"
          aria-controls="user-menu"
          aria-label="user menu"
          onClick={onMenuClick}>
          {avatarSrc ? (
            <Avatar alt={profileName} src={avatarSrc} />
          ) : (
            <Avatar alt={profileName}>{profileName[0]}</Avatar>
          )}
          <ListItemText
            primary={profileName}
            primaryTypographyProps={{ className: classes.username }}
            title={profileName}
          />
        </ListItem>
      </List>
    );
  }
}
