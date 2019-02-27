import React, { Component, Fragment } from 'react';
import { bool, string } from 'prop-types';
import { Link } from 'react-router-dom';
import { withApollo } from 'react-apollo';
import { withStyles } from '@material-ui/core/styles';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import AccountIcon from 'mdi-react/AccountIcon';
import HandPeaceIcon from 'mdi-react/HandPeaceIcon';
import { withAuth } from '../../utils/Auth';
import UserMenuList from './UserMenuList';
import UserMenuButton from './UserMenuButton';

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
  leftIcon: {
    marginRight: theme.spacing.unit,
  },
  username: {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
}))
@withAuth
@withApollo
export default class UserMenu extends Component {
  static defaultProps = {
    user: '',
    navOpen: null,
  };

  static propTypes = {
    user: string,
    navOpen: bool,
  };

  state = {
    anchorEl: null,
    signInDialogOpen: false,
  };

  handleSignOutClick = () => {
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
    const { classes, user, navOpen } = this.props;
    const { anchorEl, signInDialogOpen } = this.state;

    return (
      <Fragment>
        {navOpen ? (
          <UserMenuList
            user={user}
            signInDialogOpen={signInDialogOpen}
            onSignInDialogClose={this.handleSignInDialogClose}
            onSignInDialogOpen={this.handleSignInDialogOpen}
            onMenuClick={this.handleMenuClick}
          />
        ) : (
          <UserMenuButton
            user={user}
            signInDialogOpen={signInDialogOpen}
            onSignInDialogClose={this.handleSignInDialogClose}
            onSignInDialogOpen={this.handleSignInDialogOpen}
            onMenuClick={this.handleMenuClick}
          />
        )}
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
            onClick={this.handleSignOutClick}>
            <HandPeaceIcon className={classes.leftIcon} />
            Sign Out
          </MenuItem>
        </Menu>
      </Fragment>
    );
  }
}
