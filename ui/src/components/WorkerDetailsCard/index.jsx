import React, { Component } from 'react';
import { format, parseISO } from 'date-fns';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import DateDistance from '../DateDistance';
import { worker } from '../../utils/prop-types';

/**
 * Render information in a card layout about a worker.
 */
export default class WorkerDetailsCard extends Component {
  static propTypes = {
    /** A GraphQL worker response. */
    worker: worker.isRequired,
  };

  render() {
    const {
      worker: { quarantineUntil, firstClaim, lastDateActive },
    } = this.props;

    return (
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
      </List>
    );
  }
}
