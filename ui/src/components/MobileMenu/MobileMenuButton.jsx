import React, { Component, Fragment } from 'react';
import classNames from 'classnames';
import { object } from 'prop-types';
import { withApollo } from 'react-apollo';
import { withStyles } from '@material-ui/core/styles';
import Button from '../Button';
import SignInDialog from '../SignInDialog';
import { withAuth } from '../../utils/Auth';

@withAuth
@withApollo
@withStyles(theme => ({
  avatarButton: {
    height: 6 * theme.spacing.unit,
    width: 6 * theme.spacing.unit,
    padding: 0,
  },
}))
export default class MobileMenuButton extends Component {
  static propTypes = {
    buttonProps: object,
  };

  static defaultProps = {
    buttonProps: null,
  };

  render() {
    const {
      className,
      classes,
      user,
      buttonProps,
      signInDialogOpen,
      onSignInDialogOpen,
      onSignInDialogClose,
      onMenuClick,
      onAuthorize,
      onUnauthorize,
      ...props
    } = this.props;

    if (!user) {
      return (
        <Fragment>
          <Button
            className={className}
            size="small"
            variant="contained"
            color="primary"
            onClick={onSignInDialogOpen}
            {...buttonProps}
            {...props}>
            Sign in
          </Button>
          <SignInDialog open={signInDialogOpen} onClose={onSignInDialogClose} />
        </Fragment>
      );
    }
  }
}
