import React, { Component, Fragment } from 'react';
import classNames from 'classnames';
import { object } from 'prop-types';
import { withApollo } from 'react-apollo';
import Avatar from '@material-ui/core/Avatar';
import { withStyles } from '@material-ui/core/styles';
import IconButton from '@material-ui/core/IconButton';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import AccountCircleIcon from 'mdi-react/AccountCircleIcon';
import Button from '../Button';
import SignInDialog from '../SignInDialog';
import { withAuth } from '../../utils/Auth';

@withStyles(theme => ({
  avatarButton: {
    height: 6 * theme.spacing.unit,
    width: 6 * theme.spacing.unit,
    padding: 0,
  },
}))
@withAuth
@withApollo
export default class UserMenuButton extends Component {
  static propTypes = {
    avatarProps: object,
    buttonProps: object,
  };

  static defaultProps = {
    avatarProps: null,
    buttonProps: null,
  };

  render() {
    const {
      className,
      classes,
      user,
      avatarProps,
      buttonProps,
      signInDialogOpen,
      onSignInDialogOpen,
      onSignInDialogClose,
      onMenuClick,
      ...props
    } = this.props;

    if (!user) {
      return (
        <Fragment>
          <Button
            className={className}
            variant="contained"
            color="primary"
            onClick={onSignInDialogOpen}
            {...buttonProps}
            {...props}>
            <ListItemIcon>
              <AccountCircleIcon />
            </ListItemIcon>
            Sign in
          </Button>
          <SignInDialog open={signInDialogOpen} onClose={onSignInDialogClose} />
        </Fragment>
      );
    }

    return (
      <IconButton
        className={classNames(classes.avatarButton, className)}
        aria-haspopup="true"
        aria-controls="user-menu"
        aria-label="user menu"
        onClick={onMenuClick}
        {...props}>
        {user.profile.photos && user.profile.photos.length ? (
          <Avatar
            alt={user.profile.displayName}
            src={user.profile.photos[0].value}
            {...avatarProps}
          />
        ) : (
          <Avatar alt={user.profile.displayName} {...avatarProps}>
            {user.profile.displayName[0]}
          </Avatar>
        )}
      </IconButton>
    );
  }
}
