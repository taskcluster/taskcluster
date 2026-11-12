import React from 'react';
import withStyles from '@mui/styles/withStyles';
import MuiSpeedDialAction, {
  speedDialActionClasses,
} from '@mui/material/SpeedDialAction';
import classNames from 'classnames';
import { string, bool, oneOf } from 'prop-types';
import { withAuth } from '../../utils/Auth';

const styles = withStyles(theme => ({
  secondary: {
    ...theme.mixins.secondaryIcon,
  },
  error: {
    ...theme.mixins.errorIcon,
  },
  success: {
    ...theme.mixins.successIcon,
  },
}));

/**
 * A Material UI SpeedDialAction augmented with application specific props.
 */
function SpeedDialAction(props) {
  const {
    classes,
    className,
    color = 'secondary',
    requiresAuth = false,
    FabProps,
    user,
    onAuthorize,
    onUnauthorize,
    getCredentials,
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
      className={classNames(classes[color], className)}
      sx={{
        [`& .${speedDialActionClasses.staticTooltipLabel}`]: {
          whiteSpace: 'nowrap',
          backgroundColor: fabProps.disabled
            ? 'action.disabledBackground'
            : `${color}.main`,
          color: fabProps.disabled
            ? 'action.disabled'
            : 'secondary.contrastText',
        },
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
  /** Color of the button and of its static tooltip label */
  color: oneOf(['secondary', 'error', 'success']),
  /** If true, the button will be disabled if the user is not authenticated */
  requiresAuth: bool,
};

export default withAuth(styles(SpeedDialAction));
