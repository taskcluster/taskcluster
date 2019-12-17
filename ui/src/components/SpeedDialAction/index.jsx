import React from 'react';
import { withStyles } from '@material-ui/core/styles';
import MuiSpeedDialAction from '@material-ui/lab/SpeedDialAction';
import { string, bool } from 'prop-types';
import { withAuth } from '../../utils/Auth';

const styles = withStyles(theme => ({
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
}));

/**
 * A Material UI SpeedDialAction augmented with application specific props.
 */
function SpeedDialAction(props) {
  const {
    classes,
    requiresAuth,
    FabProps,
    user,
    onAuthorize,
    onUnauthorize,
    tooltipTitle,
    ...rest
  } = props;
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
    delete rest.onClick;
  }

  return (
    <MuiSpeedDialAction
      classes={{
        fab: classes.icon,
        staticTooltipLabel: fabProps.disabled
          ? classes.staticTooltipLabelDisabled
          : classes.staticTooltipLabel,
      }}
      FabProps={fabProps}
      {...rest}
      {...title}
      {...other}
    />
  );
}

SpeedDialAction.propTypes = {
  /** The CSS class name of the wrapper element */
  className: string,
  /** If true, the button will be disabled if the user is not authenticated */
  requiresAuth: bool,
};

SpeedDialAction.defaultProps = {
  className: null,
  requiresAuth: false,
};

export default withAuth(styles(SpeedDialAction));
