import React, { Component, Fragment } from 'react';
import { bool } from 'prop-types';
import { Link } from 'react-router-dom';
import { withApollo } from 'react-apollo';
import classNames from 'classnames';
import { darken } from '@material-ui/core/styles/colorManipulator';
import { withStyles } from '@material-ui/core/styles';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import AccountIcon from 'mdi-react/AccountIcon';
import LogoutVariantIcon from 'mdi-react/LogoutVariantIcon';
import { withAuth } from '../../utils/Auth';
import UserMenuList from './UserMenuList';
import UserMenuButton from './UserMenuButton';
import { THEME } from '../../utils/constants';

@withAuth
@withApollo
@withStyles(theme => ({
  leftIcon: {
    marginRight: theme.spacing(1),
  },
  userMenuButton: {
    marginLeft: theme.spacing(1),
  },
  buttonAvatar: {
    color: THEME.PRIMARY_TEXT_DARK,
    backgroundColor: THEME.PRIMARY_DARK,
  },
  buttonContainedPrimary: {
    color: THEME.PRIMARY_TEXT_DARK,
    backgroundColor: THEME.PRIMARY_DARK,
    '& svg': {
      fill: THEME.PRIMARY_TEXT_DARK,
    },
    '&:hover': {
      backgroundColor: darken(THEME.PRIMARY_DARK, 0.5),
    },
  },
}))
export default class UserMenu extends Component {
  static defaultProps = {
    appBar: false,
  };

  static propTypes = {
    appBar: bool,
  };

  state = {
    anchorEl: null,
    signInDialogOpen: false,
  };

  handleSignOutClick = () => {
    this.handleMenuClose();
    this.props.onUnauthorize();
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
            avatarProps={{
              className: classes.buttonAvatar,
            }}
            buttonProps={{
              classes: { containedPrimary: classes.buttonContainedPrimary },
            }}
            className={classNames({ [classes.userMenuButton]: !user })}
            signInDialogOpen={signInDialogOpen}
            onSignInDialogClose={this.handleSignInDialogClose}
            onSignInDialogOpen={this.handleSignInDialogOpen}
            onMenuClick={this.handleMenuClick}
          />
        ) : (
          <UserMenuList
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
          <Link to="/profile">
            <MenuItem title="Your Profile">
              <AccountIcon className={classes.leftIcon} />
              Profile
            </MenuItem>
          </Link>
          <MenuItem
            title={`Sign Out of ${window.env.APPLICATION_NAME}`}
            onClick={this.handleSignOutClick}>
            <LogoutVariantIcon className={classes.leftIcon} />
            Sign Out
          </MenuItem>
        </Menu>
      </Fragment>
    );
  }
}
