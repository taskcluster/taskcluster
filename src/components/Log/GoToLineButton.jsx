import React, { Component, Fragment } from 'react';
import classNames from 'classnames';
import { func } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import TextField from '@material-ui/core/TextField';
import Tooltip from '@material-ui/core/Tooltip';
import NumericIcon from 'mdi-react/NumericIcon';
import Button from '../Button';

@withStyles(theme => ({
  fabIcon: {
    ...theme.mixins.fabIcon,
  },
}))
export default class GoToLineButton extends Component {
  static propTypes = {
    onLineNumberChange: func.isRequired,
  };

  state = {
    open: false,
    lineNumber: '',
  };

  handleChange = e => {
    const number = e.target.value;

    this.setState({
      isValid: number && !Number.isNaN(+number),
      lineNumber: number,
    });
  };

  handleClose = () => {
    this.setState({ open: false });
  };

  handleOpenClick = () => {
    this.setState({ open: true });
  };

  handleSubmit = e => {
    e.preventDefault();

    if (this.state.isValid) {
      this.setState({ open: false });
      this.props.onLineNumberChange(+this.state.lineNumber);
    }
  };

  render() {
    const { classes, onLineNumberChange, className, ...props } = this.props;
    const { open, isValid, lineNumber } = this.state;

    return (
      <Fragment>
        <Tooltip placement="bottom" title="Go to line">
          <Button
            className={classNames(classes.fabIcon, className)}
            variant="round"
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
              variant="contained"
              color="secondary">
              Go to line
            </Button>
          </DialogActions>
        </Dialog>
      </Fragment>
    );
  }
}
