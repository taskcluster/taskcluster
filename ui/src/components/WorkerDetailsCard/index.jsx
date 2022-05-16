import React, { Component, Fragment } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Button,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@material-ui/core';
import DeleteIcon from 'mdi-react/DeleteIcon';
import { WorkerManager } from 'taskcluster-client-web';
import DateDistance from '../DateDistance';
import DialogAction from '../DialogAction';
import Label from '../Label';
import { withAuth } from '../../utils/Auth';
import { worker } from '../../utils/prop-types';
import { NULL_PROVIDER } from '../../utils/constants';

/**
 * Render information in a card layout about a worker.
 */
@withAuth
export default class WorkerDetailsCard extends Component {
  static propTypes = {
    /** A GraphQL worker response. */
    worker: worker.isRequired,
  };

  state = {
    dialogState: {
      error: null,
      open: false,
      title: '',
      body: '',
      confirmText: '',
      taskQueueId: '',
      workerGroup: '',
      workerId: '',
    },
  };

  handleDialogActionOpen = (taskQueueId, workerGroup, workerId) => () => {
    this.setState({
      dialogState: {
        open: true,
        title: 'Terminate Worker?',
        body: `This will terminate the worker with id ${workerId} in group ${workerGroup} within worker pool ${taskQueueId}.`,
        confirmText: 'Terminate Worker',
        taskQueueId,
        workerGroup,
        workerId,
      },
    });
  };

  handleDeleteClick = async () => {
    const { taskQueueId, workerGroup, workerId } = this.state.dialogState;
    const { user } = this.props;

    this.setState({
      dialogState: {
        ...this.state.dialogState,
        error: null,
      },
    });

    try {
      if (typeof user?.credentials === 'undefined') {
        throw new Error('User credentials not found. Please log in.');
      }

      const wm = new WorkerManager({
        rootUrl: window.env.TASKCLUSTER_ROOT_URL,
        credentials: user.credentials,
        authorizedScopes: [
          `worker-manager:remove-worker:${taskQueueId}/${workerGroup}/${workerId}`,
        ],
      });

      await wm.removeWorker(taskQueueId, workerGroup, workerId);
      this.setState({
        dialogState: {
          ...this.state.dialogState,
          open: false,
        },
      });
    } catch (error) {
      this.handleDialogActionError(error);
    }
  };

  handleDialogActionError = error => {
    this.setState({
      dialogState: {
        ...this.state.dialogState,
        error,
      },
    });
  };

  handleDialogActionClose = () => {
    this.setState({
      dialogState: {
        ...this.state.dialogState,
        error: null,
        open: false,
      },
    });
  };

  render() {
    const {
      worker: {
        quarantineUntil,
        firstClaim,
        lastDateActive,
        providerId,
        taskQueueId,
        workerGroup,
        workerId,
      },
    } = this.props;
    const {
      dialogState: { open, error, title, confirmText, body },
    } = this.state;
    const iconSize = 16;

    return (
      <Fragment>
        <List>
          <ListItem>
            <ListItemText
              primary="Last Active"
              secondary={
                lastDateActive ? <DateDistance from={lastDateActive} /> : 'n/a'
              }
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="First Claim"
              secondary={<DateDistance from={firstClaim} />}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Quarantine Until"
              secondary={
                quarantineUntil
                  ? format(parseISO(quarantineUntil), 'yyyy/MM/dd')
                  : 'n/a'
              }
            />
          </ListItem>
          {providerId !== NULL_PROVIDER ? (
            <ListItem>
              <Button
                variant="outlined"
                endIcon={<DeleteIcon size={iconSize} />}
                onClick={this.handleDialogActionOpen(
                  taskQueueId,
                  workerGroup,
                  workerId
                )}>
                Terminate Worker
              </Button>
            </ListItem>
          ) : (
            <ListItem>
              <Label mini status="warning">
                Scheduled for termination
              </Label>
            </ListItem>
          )}
        </List>
        <DialogAction
          open={open}
          onSubmit={this.handleDeleteClick}
          onClose={this.handleDialogActionClose}
          onError={this.handleDialogActionError}
          error={error}
          title={title}
          body={<Typography>{body}</Typography>}
          confirmText={confirmText}
        />
      </Fragment>
    );
  }
}
