import React, { Component } from 'react';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import MuiSpeedDialAction from '@material-ui/lab/SpeedDialAction';
import { string, bool } from 'prop-types';
import { withAuth } from '../../utils/Auth';

@withAuth
@withStyles(theme => ({
  icon: {
    ...theme.mixins.secondaryIcon,
  },
  staticTooltipLabelDisabled: {
    whiteSpace: 'nowrap',
    backgroundColor: theme.palette.action.disabledBackground,
    color: theme.palette.action.disabled,
  },
  staticTooltipLabel: {
    whiteSpace: 'nowrap',
    backgroundColor: theme.palette.secondary.main,
    color: theme.palette.secondary.contrastText,
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
      FabProps,
      user,
      onAuthorize,
      onUnauthorize,
      tooltipTitle,
      ...props
    } = this.props;
    const other = {};
    const lackingAuth = requiresAuth && !user;
    const fabProps = {
      ...FabProps,
      ...(lackingAuth ? { disabled: true } : {}),
    };
    const title = tooltipTitle
      ? {
          tooltipTitle: lackingAuth
            ? `${tooltipTitle} (Auth Required)`
            : tooltipTitle,
        }
      : null;

    if (fabProps.disabled) {
      // Remove material-ui disabled prop warning
      // https://github.com/mui-org/material-ui/issues/15216
      other.component = 'span';

      // The onclick currently gets triggered when the button is disabled.
      // Remove onClick until it gets fixed upstream.
      delete props.onClick;
    }

    return (
      <MuiSpeedDialAction
        classes={{
          fab: classes.icon,
          staticTooltipLabel: fabProps.disabled
            ? classes.staticTooltipLabelDisabled
            : classes.staticTooltipLabel,
        }}
        className={classNames(className)}
        FabProps={fabProps}
        {...props}
        {...title}
        {...other}
      />
    );
  }
}
