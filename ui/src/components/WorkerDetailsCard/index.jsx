import React, { Component, Fragment } from 'react';
import { format, parseISO } from 'date-fns';
import { List, ListItem, ListItemText, Typography } from '@material-ui/core';
import DateDistance from '../DateDistance';
import Label from '../Label';
import StatusLabel from '../StatusLabel';
import { worker } from '../../utils/prop-types';

/**
 * Render information in a card layout about a worker.
 */
export default class WorkerDetailsCard extends Component {
  static propTypes = {
    /** A GraphQL worker response. */
    worker: worker.isRequired,
  };

  static defaultProps = {
    worker: null,
  };

  render() {
    const {
      worker: {
        quarantineUntil,
        quarantineDetails,
        firstClaim,
        lastDateActive,
        state,
      },
    } = this.props;

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
          {quarantineDetails?.length > 0 && (
            <ListItem>
              <ListItemText
                primary="Quarantine History"
                secondary={
                  <ul>
                    {quarantineDetails.map(
                      ({
                        clientId,
                        updatedAt,
                        quarantineUntil,
                        quarantineInfo,
                      }) => (
                        <li key={updatedAt}>
                          {clientId} on{' '}
                          <em>
                            {format(parseISO(updatedAt), 'yyyy/MM/dd HH:ii')}
                          </em>
                          {' | '}
                          Until:{' '}
                          {format(
                            parseISO(quarantineUntil),
                            'yyyy/MM/dd'
                          )}:{' '}
                          <Typography variant="body2" component="em">
                            {quarantineInfo}
                          </Typography>
                        </li>
                      )
                    )}
                  </ul>
                }
              />
            </ListItem>
          )}
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
          {state === 'stopping' && (
            <ListItem>
              <Label mini status="warning">
                Scheduled for termination
              </Label>
            </ListItem>
          )}
        </List>
      </Fragment>
    );
  }
}
