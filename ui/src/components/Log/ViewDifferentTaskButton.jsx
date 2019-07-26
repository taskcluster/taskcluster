import React, { Component, Fragment } from 'react';
import { withRouter } from 'react-router-dom';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import TextField from '@material-ui/core/TextField';
import FeatureSearchIcon from 'mdi-react/FeatureSearchIcon';
import SpeedDialAction from '../SpeedDialAction';
import Button from '../Button';

@withRouter
export default class ViewDifferentTaskButton extends Component {
  state = {
    dialogOpen: false,
    taskId: '',
  };

  handleChange = e => {
    this.setState({ taskId: e.target.value });

    if (e.target.value) {
      this.setState({ isValid: true });
    }
  };

  handleClose = () => {
    this.setState({ dialogOpen: false });
  };

  handleOpenClick = () => {
    this.setState({ dialogOpen: true });
  };

  handleSubmit = e => {
    e.preventDefault();
    this.props.history.push(`/tasks/${this.state.taskId}`);
  };

  render() {
    const { open } = this.props;
    const { dialogOpen, isValid } = this.state;

    return (
      <Fragment>
        <SpeedDialAction
          open={open}
          tooltipOpen
          icon={<FeatureSearchIcon />}
          tooltipTitle="View Different Task"
          onClick={this.handleOpenClick}
          ButtonProps={{
            variant: 'round',
            color: 'secondary',
          }}
        />
        <Dialog
          open={dialogOpen}
          onClose={this.handleClose}
          aria-labelledby="view-different-task">
          <DialogTitle id="view-different-task">
            View Different Task
          </DialogTitle>
          <DialogContent>
            <form onSubmit={this.handleSubmit}>
              <TextField
                id="text"
                label="Task ID"
                autoFocus
                fullWidth
                onChange={this.handleChange}
                type="text"
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
              Go to task
            </Button>
          </DialogActions>
        </Dialog>
      </Fragment>
    );
  }
}
