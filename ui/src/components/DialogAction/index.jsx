import React, { Component } from 'react';
import { oneOfType, object, node, string, func, bool } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import CircularProgress from '@material-ui/core/CircularProgress';
import withMobileDialog from '@material-ui/core/withMobileDialog';
import Button from '../Button';
import ErrorPanel from '../ErrorPanel';

@withMobileDialog()
@withStyles({
  executingActionWrapper: {
    position: 'relative',
  },
  buttonProgress: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -12,
    marginTop: -12,
  },
})
/**
 * A Material UI Dialog augmented with application specific props.
 */
export default class DialogAction extends Component {
  static defaultProps = {
    title: '',
    body: '',
    error: null,
    onError: null,
    onComplete: null,
    focusOnPrimary: false,
    focusOnSecondary: false,
  };

  static propTypes = {
    /** If true, the Dialog is open. */
    open: bool.isRequired,
    /** The title of the Dialog. */
    title: node,
    /** The body of the Dialog. */
    body: node,
    /** The text content of the executing action button */
    confirmText: string.isRequired,
    /** Callback fired when the executing action button is clicked */
    onSubmit: func.isRequired,
    /**
     * Callback fired when the action is complete with
     * the return value of onSubmit. This function will not
     * be called if onSubmit throws an error.
     * */
    onComplete: func,
    /** Callback fired when onSubmit throws an error.
     * The error will be provided in the callback. */
    onError: func,
    /** Callback fired when the component requests to be closed. */
    onClose: func.isRequired,
    /** Error to display. */
    error: oneOfType([string, object]),
    /** If true, the primary action will have its focus visible
     * on dialog mount.
     * */
    focusOnPrimary: bool,
    /** If true, the secondary action will have its focus visible
     * on dialog mount.
     * */
    focusOnSecondary: bool,
  };

  state = {
    executing: false,
  };

  handleSubmit = async () => {
    const { onSubmit, onComplete, onError } = this.props;

    this.setState({ executing: true });

    try {
      const result = await onSubmit();

      if (onComplete) {
        onComplete(result);
      }

      this.setState({ executing: false });
    } catch (error) {
      if (onError) {
        onError(error);
      }

      this.setState({
        executing: false,
      });
    }
  };

  render() {
    const { executing } = this.state;
    const {
      fullScreen,
      title,
      body,
      confirmText,
      classes,
      onClose,
      open,
      error,
      focusOnPrimary,
      focusOnSecondary,
      onSubmit,
      onComplete,
      ...props
    } = this.props;

    return (
      <Dialog open={open} onClose={onClose} fullScreen={fullScreen} {...props}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          {error && (
            <DialogContentText>
              <ErrorPanel error={error} />
            </DialogContentText>
          )}
          <DialogContentText>{body}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={executing}
            onClick={onClose}
            action={actions => focusOnSecondary && actions.focusVisible()}>
            Cancel
          </Button>
          <div className={classes.executingActionWrapper}>
            <Button
              action={actions => focusOnPrimary && actions.focusVisible()}
              disabled={executing}
              onClick={this.handleSubmit}
              color="secondary"
              variant="outlined">
              {confirmText}
            </Button>
            {executing && (
              <CircularProgress size={24} className={classes.buttonProgress} />
            )}
          </div>
        </DialogActions>
      </Dialog>
    );
  }
}
