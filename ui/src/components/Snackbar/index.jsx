import React, { Component } from 'react';
import { func, object, string, oneOf } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
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
    color: theme.palette.success.contrastText,
    '& .mdi-icon': {
      fill: theme.palette.success.contrastText,
    },
  },
  info: {
    backgroundColor: theme.palette.secondary.main,
    color: theme.palette.secondary.contrastText,
    '& .mdi-icon': {
      fill: theme.palette.secondary.contrastText,
    },
  },
  error: {
    backgroundColor: theme.palette.error.dark,
    color: theme.palette.error.contrastText,
    '& .mdi-icon': {
      fill: theme.palette.error.contrastText,
    },
  },
  warning: {
    backgroundColor: theme.palette.warning.dark,
    color: theme.palette.warning.contrastText,
    '& .mdi-icon': {
      fill: theme.palette.warning.contrastText,
    },
  },
  iconVariant: {
    marginRight: theme.spacing(1),
  },
  message: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
  },
  messageDiv: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconDiv: {
    display: 'flex',
    alignItems: 'center',
    marginRight: theme.spacing(2),
  },
  iconButtonDiv: {
    marginRight: -12,
  },
  snackbarContentMessage: {
    flex: 1,
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
    /** Callback fired when the component requests to be closed. */
    onClose: func.isRequired,
  };

  static defaultProps = {
    variant: 'success',
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

    return (
      <MuiSnackbar autoHideDuration={5000} onClose={onClose} {...props}>
        <SnackbarContent
          classes={{ message: classes.snackbarContentMessage }}
          className={classes[variant]}
          message={
            <div className={classes.messageDiv}>
              <div className={classes.iconDiv}>
                <Icon className={classes.iconVariant} />
              </div>
              <div className={classes.message}>{message}</div>
              <div className={classes.iconButtonDiv}>
                <IconButton aria-label="Close" onClick={onClose}>
                  <CloseIcon />
                </IconButton>
              </div>
            </div>
          }
          {...snackbarContentProps}
        />
      </MuiSnackbar>
    );
  }
}
