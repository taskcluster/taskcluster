import React, { Fragment } from 'react';
import {
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@material-ui/core';
import CloseIcon from 'mdi-react/CloseIcon';
import DateDistance from '../../../components/DateDistance';
import JsonDisplay from '../../../components/JsonDisplay';

const LaunchConfigDetails = ({ launchConfig, onClose, classes }) => {
  if (!launchConfig) {
    return null;
  }

  return (
    <Fragment>
      <IconButton onClick={onClose} className={classes.drawerCloseIcon}>
        <CloseIcon />
      </IconButton>
      <div className={classes.metadataContainer}>
        <Typography
          variant="h5"
          className={classes.headline}
          title={launchConfig.launchConfigId}>
          {launchConfig.launchConfigId}
        </Typography>
        <List>
          <ListItem>
            <ListItemText
              primary="Status"
              secondary={launchConfig.isArchived ? 'Archived' : 'Active'}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Created"
              secondary={
                <Fragment>
                  <Typography variant="body2">
                    {launchConfig.created}
                  </Typography>
                  <Typography variant="body1">
                    <DateDistance from={launchConfig.created} />
                  </Typography>
                </Fragment>
              }
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Last Modified"
              secondary={
                <Fragment>
                  <Typography variant="body2">
                    {launchConfig.lastModified}
                  </Typography>
                  <Typography variant="body1">
                    <DateDistance from={launchConfig.lastModified} />
                  </Typography>
                </Fragment>
              }
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Location"
              secondary={launchConfig.location || 'N/A'}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Config Weight"
              secondary={
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Initial Weight</TableCell>
                      <TableCell>Dynamic Weight</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell>{launchConfig.initialWeight ?? 1}</TableCell>
                      <TableCell>{launchConfig.dynamicWeight}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              }
            />
          </ListItem>

          <ListItem>
            <ListItemText
              primary="Max Capacity"
              secondary={
                launchConfig.configuration?.workerManager?.maxCapacity ??
                'Not set'
              }
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Workers Capacity"
              secondary={
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Requested</TableCell>
                      <TableCell>Running</TableCell>
                      <TableCell>Stopping</TableCell>
                      <TableCell>Stopped</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell>
                        {launchConfig.workerStats.requestedCapacity}
                      </TableCell>
                      <TableCell>
                        {launchConfig.workerStats.runningCapacity}
                      </TableCell>
                      <TableCell>
                        {launchConfig.workerStats.stoppingCapacity}
                      </TableCell>
                      <TableCell>
                        {launchConfig.workerStats.stoppedCapacity}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              }
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Workers Count"
              secondary={
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Requested</TableCell>
                      <TableCell>Running</TableCell>
                      <TableCell>Stopping</TableCell>
                      <TableCell>Stopped</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell>
                        {launchConfig.workerStats.requestedCount}
                      </TableCell>
                      <TableCell>
                        {launchConfig.workerStats.runningCount}
                      </TableCell>
                      <TableCell>
                        {launchConfig.workerStats.stoppingCount}
                      </TableCell>
                      <TableCell>
                        {launchConfig.workerStats.stoppedCount}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              }
            />
          </ListItem>

          <ListItem>
            <ListItemText
              primary="Total Errors"
              secondary={launchConfig.totalErrors}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Configuration"
              secondaryTypographyProps={{
                component: 'div',
              }}
              secondary={
                <JsonDisplay
                  syntax="yaml"
                  objectContent={launchConfig.configuration}
                />
              }
            />
          </ListItem>
        </List>
      </div>
    </Fragment>
  );
};

export default LaunchConfigDetails;
