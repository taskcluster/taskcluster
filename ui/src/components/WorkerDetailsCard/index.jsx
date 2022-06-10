import React, { Component, Fragment } from 'react';
import { format, parseISO } from 'date-fns';
import { List, ListItem, ListItemText, Typography } from '@material-ui/core';
import DeleteIcon from 'mdi-react/DeleteIcon';
import { bool, func, object, oneOfType, string } from 'prop-types';
import Button from '../Button';
import DateDistance from '../DateDistance';
import DialogAction from '../DialogAction';
import Label from '../Label';
import StatusLabel from '../StatusLabel';
import { worker } from '../../utils/prop-types';
import { NULL_PROVIDER } from '../../utils/constants';

/**
 * Render information in a card layout about a worker.
 */
export default class WorkerDetailsCard extends Component {
  static propTypes = {
    /** A GraphQL worker response. */
    worker: worker.isRequired,
    /** Callback function fired when the dialog should open. */
    onDialogActionOpen: func,
    /** Callback function fired when a worker is deleted. */
    onDeleteClick: func,
    /** Callback function fired when the DialogAction component
     * throws an error.
     * */
    onDialogActionError: func,
    /** Callback function fired when the dialog should close. */
    onDialogActionClose: func,
    /** Error to display when an action dialog is open. */
    dialogError: oneOfType([string, object]),
    /** Text to display to confirm dialog selection. */
    dialogConfirmText: string,
    /** Text to display in the body of the action dialog. */
    dialogBody: string,
    /** Text to display as the title of the action dialog. */
    dialogTitle: string,
    /** Boolean to track if the action dialog is open. */
    dialogOpen: bool,
  };

  static defaultProps = {
    worker: null,
    onDialogActionOpen: null,
    onDeleteClick: null,
    onDialogActionError: null,
    onDialogActionClose: null,
    dialogError: null,
    dialogConfirmText: '',
    dialogBody: '',
    dialogTitle: '',
    dialogOpen: false,
  };

  handleDialogActionOpen = () => {
    this.props.onDialogActionOpen(
      this.props.worker.workerId,
      this.props.worker.workerGroup,
      this.props.worker.workerPoolId
    );
  };

  render() {
    const {
      worker: {
        quarantineUntil,
        firstClaim,
        lastDateActive,
        providerId,
        state,
      },
      onDeleteClick,
      onDialogActionError,
      onDialogActionClose,
      dialogError,
      dialogConfirmText,
      dialogBody,
      dialogTitle,
      dialogOpen,
    } = this.props;
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
          <ListItem>
            <ListItemText
              primary="Worker State"
              secondary={
                state ? (
                  <StatusLabel state={state.toUpperCase()} />
                ) : (
                  <em>n/a</em>
                )
              }
            />
          </ListItem>
          {providerId !== NULL_PROVIDER && (
            <ListItem>
              <Button
                requiresAuth
                disabled={
                  ['stopping', 'stopped'].includes(state) ||
                  ['static', 'none'].includes(providerId)
                }
                variant="outlined"
                endIcon={<DeleteIcon size={iconSize} />}
                onClick={this.handleDialogActionOpen}
                tooltipProps={{
                  title: ['static', 'none'].includes(providerId)
                    ? 'Cannot Terminate Static/Standalone Worker'
                    : 'Terminate Worker',
                }}>
                Terminate
              </Button>
            </ListItem>
          )}
          {state === 'stopping' && (
            <ListItem>
              <Label mini status="warning">
                Scheduled for termination
              </Label>
            </ListItem>
          )}
        </List>
        {dialogOpen && (
          <DialogAction
            open={dialogOpen}
            onSubmit={onDeleteClick}
            onClose={onDialogActionClose}
            onError={onDialogActionError}
            error={dialogError}
            title={dialogTitle}
            body={<Typography>{dialogBody}</Typography>}
            confirmText={dialogConfirmText}
          />
        )}
      </Fragment>
    );
  }
}
