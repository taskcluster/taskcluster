import React, { Component } from 'react';
import { oneOfType, object, node, string, func, bool } from 'prop-types';
import { useTheme } from '@mui/material/styles';
import withStyles from '@mui/styles/withStyles';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import CircularProgress from '@mui/material/CircularProgress';
import useMediaQuery from '@mui/material/useMediaQuery';
import Button from '../Button';
import ErrorPanel from '../ErrorPanel';

const withMobileDialog = Wrapped =>
  // biome-ignore lint/correctness/noComponentHookFactories: decorator
  function MobileDialogComponent(props) {
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down('md'), {
      noSsr: true,
    });

    return <Wrapped fullScreen={fullScreen} {...props} />;
  };

@withMobileDialog
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
      onSubmit,
      onComplete,
      ...props
    } = this.props;
    const withoutBodyProps = !body ? { maxWidth: 'sm', fullWidth: true } : {};

    return (
      <Dialog
        open={open}
        onClose={onClose}
        fullScreen={fullScreen}
        {...withoutBodyProps}
        {...props}>
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
          <Button disabled={executing} onClick={onClose}>
            Cancel
          </Button>
          <div className={classes.executingActionWrapper}>
            <Button
              disabled={executing}
              onClick={this.handleSubmit}
              color="secondary">
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
