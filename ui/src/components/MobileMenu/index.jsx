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
import HandPeaceIcon from 'mdi-react/HandPeaceIcon';
import BookOpenPageVariantIcon from 'mdi-react/BookOpenPageVariantIcon';
import { withAuth } from '../../utils/Auth';
import MobileMenuList from './MobileMenuList';
import MobileMenuButton from './MobileMenuButton';
import { THEME } from '../../utils/constants';

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

  render() {
    const { classes, user, appBar } = this.props;
    const { anchorEl, signInDialogOpen } = this.state;

    return (
      <Fragment>
        {appBar ? (
          <MobileMenuButton
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
          <MobileMenuList
            signInDialogOpen={signInDialogOpen}
            onSignInDialogClose={this.handleSignInDialogClose}
            onSignInDialogOpen={this.handleSignInDialogOpen}
            onMenuClick={this.handleMenuClick}
          />
        )}
        <Menu
          id="mobile-menu"
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={this.handleMenuClose}>
          <MenuItem title="Documentation" component={Link} to="/docs/">
            <BookOpenPageVariantIcon className={classes.leftIcon} />
            Documentation
          </MenuItem>

          <MenuItem title="Your Profile" component={Link} to="/profile/">
            <AccountIcon className={classes.leftIcon} />
            Account
          </MenuItem>
          <MenuItem
            title={`Sign Out of ${window.env.APPLICATION_NAME}`}
            onClick={this.handleSignOutClick}>
            <HandPeaceIcon className={classes.leftIcon} />
            Sign Out
          </MenuItem>
        </Menu>
      </Fragment>
    );
  }
}
