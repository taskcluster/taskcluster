import { Component, Fragment } from 'react';
import { withStyles } from '@material-ui/core/styles';
import Avatar from '@material-ui/core/Avatar';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import AccountCircleIcon from 'mdi-react/AccountCircleIcon';
import { withAuth } from '../../utils/Auth';
import SignInDialog from '../SignInDialog';

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
}))
@withAuth
export default class UserMenu extends Component {
  state = {
    anchorEl: null,
    signInDialogOpen: false,
  };

  handleMenuClick = e => {
    this.setState({ anchorEl: e.currentTarget });
  };

  handleMenuClose = () => {
    this.setState({ anchorEl: null });
  };

  handleSignInDialogOpen = () => {
    this.setState({ signInDialogOpen: true });
  };

  handleSignInDialogClose = () => {
    this.setState({ signInDialogOpen: false });
  };

  handleClickSignOut = () => {
    this.handleMenuClose();
    this.props.onUnauthorize();
  };

  render() {
    const { classes, user } = this.props;
    const { anchorEl, signInDialogOpen } = this.state;

    if (!user) {
      return (
        <List component="nav">
          <ListItem
            button
            aria-haspopup="true"
            aria-controls="user-menu"
            aria-label="user menu"
            onClick={this.handleSignInDialogOpen}>
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
              onClose={this.handleSignInDialogClose}
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
            onClick={this.handleMenuClick}>
            {profile.photos && profile.photos.length ? (
              <Avatar alt={profile.displayName} src={profile.photos[0].value} />
            ) : (
              <Avatar alt={profile.displayName}>
                {profile.displayName[0]}
              </Avatar>
            )}
            <ListItemText primary={profile.displayName} />
          </ListItem>
        </List>
        <Menu
          id="user-menu"
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={this.handleMenuClose}>
          <MenuItem onClick={this.handleMenuClose}>Manage Credentials</MenuItem>
          <MenuItem onClick={this.handleClickSignOut}>Sign Out</MenuItem>
        </Menu>
      </Fragment>
    );
  }
}
