import { Component } from 'react';
import { node, string, func, bool } from 'prop-types';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import { withStyles } from '@material-ui/core/styles';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import CircularProgress from '@material-ui/core/CircularProgress';
import withMobileDialog from '@material-ui/core/withMobileDialog';
import Button from '../Button';

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
 * A button that displays a dialog when clicked.
 */
export default class DialogAction extends Component {
  static propTypes = {
    /** If true, the Dialog is open. */
    open: bool.isRequired,
    /** The title of the Dialog. */
    title: node,
    /** The body of the Dialog. */
    body: node,
    /** The text content of the executing action button */
    confirmText: string,
    /** Callback fired when the executing action button is clicked */
    onSubmit: func.isRequired,
    /** Callback fired when the component requests to be closed. */
    onClose: func.isRequired,
  };

  static defaultProps = {
    title: '',
    body: '',
    confirmText: '',
  };

  state = {
    executing: false,
    error: null,
  };

  handleSubmit = async () => {
    this.setState({ executing: true, error: null });

    try {
      await this.props.onSubmit();

      this.setState({ executing: false });
    } catch (error) {
      this.setState({
        executing: false,
        error,
      });
    }

    this.props.onClose();
  };

  render() {
    const { executing, error } = this.state;
    const {
      fullScreen,
      title,
      body,
      confirmText,
      classes,
      onSubmit: _,
      onClose,
      open,
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
          <DialogContentText component="div">{body}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button disabled={executing} onClick={onClose} color="secondary">
            Cancel
          </Button>
          <div className={classes.executingActionWrapper}>
            <Button
              disabled={executing}
              onClick={this.handleSubmit}
              color="secondary"
              autoFocus>
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
