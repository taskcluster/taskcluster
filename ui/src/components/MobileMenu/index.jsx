import React, { Component, Fragment } from 'react';
import { bool } from 'prop-types';
import { Link } from 'react-router-dom';
import { withApollo } from 'react-apollo';
import { darken } from '@material-ui/core/styles/colorManipulator';
import { withStyles } from '@material-ui/core/styles';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import AccountIcon from 'mdi-react/AccountIcon';
import { withAuth } from '../../utils/Auth';
import MobileMenuList from './MobileMenuList';
import { THEME } from '../../utils/constants';
import SignInDialog from '../SignInDialog';
import BookOpenPageVariantIcon from 'mdi-react/BookOpenPageVariantIcon';
import LogoutVariantIcon from 'mdi-react/LogoutVariantIcon';
import AccountCircleIcon from 'mdi-react/AccountCircleIcon';

@withAuth
@withApollo
@withStyles(theme => ({
  leftIcon: {
    marginRight: theme.spacing.unit,
  },
  userMenuButton: {
    marginLeft: theme.spacing.unit,
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
export default class MobileMenu extends Component {
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
  handleOpenSignInDialog = () => {
    this.setState({ signInDialogOpen: true });
  };
  handleCloseSignInDialog = () => {
    this.setState({ signInDialogOpen: false });
  };

  render() {
    const { classes, user, appBar } = this.props;
    const pathname= window.location.pathname;
    const { anchorEl, signInDialogOpen } = this.state;

    return (
      <Fragment>
        <MobileMenuList
            signInDialogOpen={signInDialogOpen}
            onSignInDialogClose={this.handleSignInDialogClose}
            onSignInDialogOpen={this.handleSignInDialogOpen}
            onMenuClick={this.handleMenuClick}
          />
        {user && (<Menu
          id="mobile-menu"
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={this.handleMenuClose}>
          <MenuItem title="Your Profile" selected={pathname === "/profile"} component={Link} to="/profile">
            <AccountIcon className={classes.leftIcon} />
            Profile
          </MenuItem>
          <MenuItem title="Documentation" selected={pathname === "/docs/"} component={Link} to="/docs/">
              <BookOpenPageVariantIcon className={classes.leftIcon} />
              Documentation
          </MenuItem>
          <MenuItem
            title={`Sign Out of ${window.env.APPLICATION_NAME}`}
            onClick={this.handleSignOutClick}>
            <LogoutVariantIcon className={classes.leftIcon} />
            Sign Out
          </MenuItem>
        </Menu>)}
        {!user && (
        [<Menu
          key='mobilemenu'
          id="mobile-menu"
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={this.handleMenuClose}>
          <MenuItem title="Documentation" selected={pathname === "/docs/"} component={Link} to="/docs/">
              <BookOpenPageVariantIcon className={classes.leftIcon} />
              Documentation
          </MenuItem>
          <MenuItem
            title={`Sign In ${window.env.APPLICATION_NAME}`}
            onClick={this.handleOpenSignInDialog}>
            <AccountCircleIcon className={classes.leftIcon} />
            Sign In
          </MenuItem>
        </Menu>,
         <SignInDialog key='mobilesignin'
         open={signInDialogOpen}
         onClose={this.handleCloseSignInDialog}
       />]
       )}
      </Fragment>
    );
  }
}
