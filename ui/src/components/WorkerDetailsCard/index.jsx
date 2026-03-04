import React, { Component, Fragment } from 'react';
import { format, parseISO } from 'date-fns';
import {
  List,
  ListItem,
  ListItemText,
  Typography,
  Grid,
  TableRow,
  TableCell,
  Tooltip,
} from '@material-ui/core';
import DateDistance from '../DateDistance';
import Label from '../Label';
import StatusLabel from '../StatusLabel';
import { worker } from '../../utils/prop-types';
import DataTable from '../DataTable';
import TableCellItem from '../TableCellItem';

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

  renderQuarantineRow = ({
    clientId,
    updatedAt,
    quarantineUntil,
    quarantineInfo,
  }) => (
    <TableRow
      key={`${clientId}-${updatedAt}-${quarantineUntil}-${quarantineInfo}`}>
      <TableCell>{clientId}</TableCell>
      <TableCell>
        <Tooltip title={updatedAt} placement="top">
          <TableCellItem>
            <DateDistance from={updatedAt} />
          </TableCellItem>
        </Tooltip>
      </TableCell>
      <TableCell>
        <Tooltip title={quarantineUntil} placement="top">
          <TableCellItem>
            {format(parseISO(quarantineUntil), 'yyyy/MM/dd')}
          </TableCellItem>
        </Tooltip>
      </TableCell>
      <TableCell>
        <Typography variant="body2" component="em">
          {quarantineInfo}
        </Typography>
      </TableCell>
    </TableRow>
  );

  render() {
    const {
      worker: {
        quarantineUntil,
        quarantineDetails,
        firstClaim,
        lastDateActive,
        created,
        expires,
        lastModified,
        lastChecked,
        state,
      },
    } = this.props;
    const sortedQuarantineDetails = quarantineDetails
      ? [...quarantineDetails].sort(
          (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
        )
      : [];

    return (
      <Fragment>
        <List>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <ListItem>
                <ListItemText
                  primary="Last Active"
                  secondary={
                    lastDateActive ? (
                      <DateDistance from={lastDateActive} />
                    ) : (
                      'n/a'
                    )
                  }
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="First Claim"
                  secondary={
                    firstClaim ? <DateDistance from={firstClaim} /> : 'n/a'
                  }
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
              {sortedQuarantineDetails?.length > 0 && (
                <ListItem>
                  <ListItemText
                    primary="Quarantine History"
                    secondary={
                      <DataTable
                        items={sortedQuarantineDetails}
                        renderRow={this.renderQuarantineRow}
                        headers={[
                          { id: 'clientId', label: 'Client ID' },
                          { id: 'updatedAt', label: 'Date' },
                          { id: 'quarantineUntil', label: 'Until' },
                          { id: 'quarantineInfo', label: 'Reason' },
                        ]}
                        paginate
                        noItemsMessage="No quarantine history available."
                      />
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
            </Grid>
            <Grid item xs={6}>
              {/* worker-manager view specific info */}
              {created && (
                <ListItem>
                  <ListItemText
                    primary="Worker created"
                    secondary={<DateDistance from={created} />}
                  />
                </ListItem>
              )}
              {expires && (
                <ListItem>
                  <ListItemText
                    primary="Worker expires"
                    secondary={<DateDistance from={expires} />}
                  />
                </ListItem>
              )}
              {lastModified && (
                <ListItem>
                  <ListItemText
                    primary="Worker last modified"
                    secondary={<DateDistance from={lastModified} />}
                  />
                </ListItem>
              )}
              {lastChecked && (
                <ListItem>
                  <ListItemText
                    primary="Last checked by worker-manager"
                    secondary={<DateDistance from={lastChecked} />}
                  />
                </ListItem>
              )}
            </Grid>
          </Grid>
        </List>
      </Fragment>
    );
  }
}
