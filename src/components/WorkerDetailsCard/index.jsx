import { Component } from 'react';
import { format } from 'date-fns';
import List, { ListItem, ListItemText } from 'material-ui/List';
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
      worker: { quarantineUntil, firstClaim },
    } = this.props;

    return (
      <List>
        <ListItem>
          <ListItemText
            primary="First Claim"
            secondary={<DateDistance from={firstClaim} />}
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Quarantine Until"
            secondary={quarantineUntil ? format(quarantineUntil, 'LL') : 'n/a'}
          />
        </ListItem>
      </List>
    );
  }
}
