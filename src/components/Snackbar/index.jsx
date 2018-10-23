import React, { Component } from 'react';
import { func, object, string, oneOf } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import { fade } from '@material-ui/core/styles/colorManipulator';
import IconButton from '@material-ui/core/IconButton';
import MuiSnackbar from '@material-ui/core/Snackbar';
import SnackbarContent from '@material-ui/core/SnackbarContent';
import CheckCircleIcon from 'mdi-react/CheckCircleIcon';
import WarningIcon from 'mdi-react/WarningIcon';
import AlertCircleIcon from 'mdi-react/AlertCircleIcon';
import InformationIcon from 'mdi-react/InformationIcon';
import CloseIcon from 'mdi-react/CloseIcon';

const variantIcon = {
  success: CheckCircleIcon,
  warning: WarningIcon,
  error: AlertCircleIcon,
  info: InformationIcon,
};

@withStyles(theme => ({
  success: {
    backgroundColor: theme.palette.success.dark,
    color: fade(theme.palette.common.white, 0.9),
  },
  info: {
    backgroundColor: theme.palette.secondary.main,
    color: fade(theme.palette.common.white, 0.9),
  },
  error: {
    backgroundColor: theme.palette.error.dark,
    color: fade(theme.palette.common.white, 0.9),
  },
  warning: {
    backgroundColor: theme.palette.warning.dark,
    color: theme.palette.warning.contrastText,
  },
  closeIconWhite: {
    opacity: 0.9,
  },
  closeIconBlack: {
    opacity: 0.9,
    color: theme.palette.warning.contrastText,
  },
  iconVariant: {
    marginRight: theme.spacing.unit,
  },
  message: {
    display: 'flex',
    alignItems: 'center',
  },
}))
export default class Snackbar extends Component {
  static propTypes = {
    /** Applies appropriate coloring to indicate purpose of message. */
    variant: oneOf(['success', 'info', 'error', 'warning']),
    /** The message to display. */
    message: string.isRequired,
    /** Properties applied to the SnackbarContent element. */
    snackbarContentProps: object,
    onClose: func,
  };

  static defaultProps = {
    variant: 'success',
    onClose: null,
    snackbarContentProps: null,
  };

  render() {
    const {
      classes,
      onClose,
      variant,
      message,
      snackbarContentProps,
      ...props
    } = this.props;
    const Icon = variantIcon[variant];
    const isWarning = variant === 'warning';

    return (
      <MuiSnackbar {...props}>
        <SnackbarContent
          className={classes[variant]}
          action={
            <IconButton aria-label="Close" onClick={onClose}>
              <CloseIcon
                className={
                  isWarning ? classes.closeIconBlack : classes.closeIconWhite
                }
              />
            </IconButton>
          }
          message={
            <span className={classes.message}>
              <Icon className={classes.iconVariant} />
              {message}
            </span>
          }
          {...snackbarContentProps}
        />
      </MuiSnackbar>
    );
  }
}
