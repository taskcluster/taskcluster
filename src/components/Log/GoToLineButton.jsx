import { Component, Fragment } from 'react';
import { func } from 'prop-types';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import TextField from '@material-ui/core/TextField';
import Tooltip from '@material-ui/core/Tooltip';
import NumericIcon from 'mdi-react/NumericIcon';

export default class GoToLineButton extends Component {
  static propTypes = {
    onLineNumberChange: func.isRequired,
  };

  state = {
    open: false,
    lineNumber: '',
  };

  handleOpenClick = () => {
    this.setState({ open: true });
  };

  handleClose = () => {
    this.setState({ open: false });
  };

  handleChange = e => {
    const number = e.target.value;

    this.setState({
      isValid: number && !Number.isNaN(+number),
      lineNumber: number,
    });
  };

  handleSubmit = e => {
    e.preventDefault();

    if (this.state.isValid) {
      this.setState({ open: false });
      this.props.onLineNumberChange(+this.state.lineNumber);
    }
  };

  render() {
    const { onLineNumberChange, ...props } = this.props;
    const { open, isValid, lineNumber } = this.state;

    return (
      <Fragment>
        <Tooltip placement="bottom" title="Go to line">
          <Button
            variant="fab"
            mini
            color="secondary"
            onClick={this.handleOpenClick}
            {...props}>
            <NumericIcon />
          </Button>
        </Tooltip>
        <Dialog
          open={open}
          onClose={this.handleClose}
          aria-labelledby="go-to-line-title">
          <DialogTitle id="go-to-line-title">Go to line number</DialogTitle>
          <DialogContent>
            <form onSubmit={this.handleSubmit}>
              <TextField
                id="number"
                label="Line number"
                autoFocus
                fullWidth
                value={lineNumber}
                onChange={this.handleChange}
                type="number"
                margin="dense"
              />
            </form>
          </DialogContent>
          <DialogActions>
            <Button onClick={this.handleClose}>Cancel</Button>
            <Button
              onClick={this.handleSubmit}
              disabled={!isValid}
              variant="raised"
              color="secondary">
              Go to line
            </Button>
          </DialogActions>
        </Dialog>
      </Fragment>
    );
  }
}
