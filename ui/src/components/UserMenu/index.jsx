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
  leftIcon: {
    marginRight: theme.spacing.unit,
  },
  userMenuButton: {
    marginLeft: theme.spacing.unit,
  },
}))
@withAuth
@withApollo
export default class UserMenu extends Component {
  static defaultProps = {
    user: '',
    appBar: false,
  };

  static propTypes = {
    user: string,
    appBar: bool,
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
    const { classes, user, appBar } = this.props;
    const { anchorEl, signInDialogOpen } = this.state;

    return (
      <Fragment>
        {appBar ? (
          <UserMenuButton
            className={classes.userMenuButton}
            user={user}
            signInDialogOpen={signInDialogOpen}
            onSignInDialogClose={this.handleSignInDialogClose}
            onSignInDialogOpen={this.handleSignInDialogOpen}
            onMenuClick={this.handleMenuClick}
          />
        ) : (
          <UserMenuList
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
