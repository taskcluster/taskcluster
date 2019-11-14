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
import getPictureFromUser from '../../utils/getPictureFromUser';

@withAuth
@withApollo
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
                disableTypography
                className={classes.text}
                inset
                primary="Sign In"
              />
            </ListItem>
          </List>
          <SignInDialog open={signInDialogOpen} onClose={onSignInDialogClose} />
        </Fragment>
      );
    }

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
            {avatarSrc ? (
              <Avatar alt={user.profile.displayName} src={avatarSrc} />
            ) : (
              <Avatar alt={user.profile.displayName}>
                {user.profile.displayName[0]}
              </Avatar>
            )}
            <ListItemText
              primary={user.profile.displayName}
              primaryTypographyProps={{ className: classes.username }}
              title={user.profile.displayName}
            />
          </ListItem>
        </List>
      </Fragment>
    );
  }
}
