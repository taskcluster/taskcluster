import React, { Component } from 'react';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import MuiSpeedDialAction from '@material-ui/lab/SpeedDialAction';
import { string, bool } from 'prop-types';
import { withAuth } from '../../utils/Auth';

@withAuth
@withStyles(theme => ({
  secondaryIcon: {
    ...theme.mixins.secondaryIcon,
  },
}))
/**
 * A Material UI SpeedDialAction augmented with application specific props.
 */
export default class SpeedDialAction extends Component {
  static defaultProps = {
    className: null,
    requiresAuth: false,
  };

  static propTypes = {
    /** The CSS class name of the wrapper element */
    className: string,
    /** If true, the button will be disabled if the user is not authenticated */
    requiresAuth: bool,
  };

  render() {
    const {
      classes,
      className,
      requiresAuth,
      ButtonProps,
      user,
      onAuthorize,
      onUnauthorize,
      ...props
    } = this.props;
    const disabled = requiresAuth && !user;
    const buttonProps = {
      ...ButtonProps,
      ...(disabled ? { disabled: true } : {}),
    };

    return (
      <MuiSpeedDialAction
        className={classNames(classes.secondaryIcon, className)}
        ButtonProps={buttonProps}
        {...props}
      />
    );
  }
}
