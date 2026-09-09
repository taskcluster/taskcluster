import React, { Component } from 'react';
import { bool, func, string } from 'prop-types';
import FormControl from '@material-ui/core/FormControl';
import InputLabel from '@material-ui/core/InputLabel';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import DialogAction from '../DialogAction';
import references from '../../../../generated/references.json';

/**
 * Priority levels accepted by `queue.changeTaskPriority` and
 * `queue.changeTaskGroupPriority`, ordered highest to lowest. Read from the
 * generated schema (rather than duplicated here) so this list can't drift
 * from the queue service's canonical `task-priorities` constant.
 */
export const TASK_PRIORITIES = references.find(
  ({ content }) =>
    content.$id === '/schemas/queue/v1/change-task-priority-request.json#'
).content.properties.newPriority.enum;

/**
 * A shared dialog for changing the priority of a task or a task group.
 * Renders a priority dropdown and, on confirm, calls `onSubmit(priority)`.
 */
export default class ChangeTaskPriorityDialog extends Component {
  static defaultProps = {
    currentPriority: null,
    onComplete: null,
  };

  static propTypes = {
    /** If true, the dialog is open. */
    open: bool.isRequired,
    /** The current priority, used as the initial selection. */
    currentPriority: string,
    /** Called with the chosen priority when the user confirms. */
    onSubmit: func.isRequired,
    /** Called when the dialog requests to be closed. */
    onClose: func.isRequired,
    /** Called on a successful change. */
    onComplete: func,
  };

  state = {
    priority: this.props.currentPriority || 'lowest',
    error: null,
  };

  componentDidUpdate(prevProps) {
    // reset the selection (and any error) each time the dialog is (re)opened
    if (this.props.open && !prevProps.open) {
      this.setState({
        priority: this.props.currentPriority || 'lowest',
        error: null,
      });
    }
  }

  handlePriorityChange = event => {
    this.setState({ priority: event.target.value });
  };

  handleSubmit = () => this.props.onSubmit(this.state.priority);

  handleError = error => {
    this.setState({ error });
  };

  render() {
    const { open, onClose, onComplete } = this.props;
    const { priority, error } = this.state;

    return (
      <DialogAction
        open={open}
        title="Change Task Priority"
        confirmText="Save"
        body={
          <FormControl fullWidth>
            <InputLabel id="change-task-priority-label">Priority</InputLabel>
            <Select
              labelId="change-task-priority-label"
              value={priority}
              onChange={this.handlePriorityChange}>
              {TASK_PRIORITIES.map(p => (
                <MenuItem key={p} value={p}>
                  {p}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        }
        onSubmit={this.handleSubmit}
        onComplete={onComplete}
        onError={this.handleError}
        error={error}
        onClose={onClose}
      />
    );
  }
}
