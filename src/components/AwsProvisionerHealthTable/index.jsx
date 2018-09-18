import { Fragment, Component } from 'react';
import { pipe, map, isEmpty, defaultTo, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
import { camelCase } from 'change-case/change-case';
import { withStyles } from '@material-ui/core/styles';
import TableRow from '@material-ui/core/TableRow';
import Drawer from '@material-ui/core/Drawer';
import TableCell from '@material-ui/core/TableCell';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import InformationVariantIcon from 'mdi-react/InformationVariantIcon';
import TableCellListItem from '../TableCellListItem';
import { awsProvisionerHealth } from '../../utils/prop-types';
import sort from '../../utils/sort';
import DataTable from '../DataTable';

const sorted = pipe(
  rSort((a, b) =>
    sort(
      `${a.region}-${a.az}-${a.instanceType}`,
      `${b.region}-${b.az}-${b.instanceType}`
    )
  ),
  map(({ region, az, instanceType }) => `${region}-${az}-${instanceType}`)
);
const iconSize = 18;
const or0 = defaultTo(0);

@withStyles(theme => ({
  drawerContainer: {
    paddingTop: theme.spacing.double,
    paddingBottom: theme.spacing.double,
    width: 400,
  },
  headline: {
    paddingLeft: theme.spacing.triple,
    paddingRight: theme.spacing.triple,
  },
  emptyText: {
    marginTop: theme.spacing.unit,
  },
}))
export default class AwsProvisionerHealthTable extends Component {
  static propTypes = {
    /** A GraphQL awsProvisionerHealth response. */
    healthData: awsProvisionerHealth.isRequired,
  };

  state = {
    sortBy: null,
    sortDirection: null,
    drawerOpen: false,
  };

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  createSortedHealth = memoize(
    (healthData, sortBy, sortDirection) => {
      const healthSummary = {};
      const { requestHealth, terminationHealth, running } = healthData;
      const identifier = item =>
        `${item.az}-${item.region}-${item.instanceType}`;

      requestHealth.forEach(item => {
        healthSummary[identifier(item)] = {
          ...healthSummary[identifier(item)],
          ...item,
        };
      });
      terminationHealth.forEach(item => {
        healthSummary[identifier(item)] = {
          ...healthSummary[identifier(item)],
          ...item,
        };
      });
      running.forEach(item => {
        healthSummary[identifier(item)] = {
          ...healthSummary[identifier(item)],
          ...item,
        };
      });

      Object.entries(healthSummary).forEach(([key, item]) => {
        healthSummary[key].healthy =
          or0(item.successful) + or0(item.cleanShutdown) + or0(item.running);
        healthSummary[key].unhealthy =
          or0(item.failed) +
          or0(item.spotKill) +
          or0(item.insufficientCapacity) +
          or0(item.volumeLimitExceeded) +
          or0(item.missingAmi) +
          or0(item.startupFailed) +
          or0(item.unknownCodes) +
          or0(item.noCode);
      });

      const sortByProperty = camelCase(sortBy);
      const healthValues = Object.values(healthSummary);

      if (!sortBy || isEmpty(healthValues)) {
        return healthValues;
      }

      return healthValues.sort((a, b) => {
        const firstElement =
          sortDirection === 'desc' ? b[sortByProperty] : a[sortByProperty];
        const secondElement =
          sortDirection === 'desc' ? a[sortByProperty] : b[sortByProperty];

        return sort(firstElement, secondElement);
      });
    },
    {
      serializer: ([healthData, sortBy, sortDirection]) => {
        const ids = sorted(healthData.running);

        return `${ids.join('-')}-${sortBy}-${sortDirection}`;
      },
    }
  );

  handleDrawerOpen = (healthItem, columnName) => {
    this.setState({
      drawerOpen: true,
      drawerItem: {
        ...healthItem,
        columnName,
      },
    });
  };

  handleDrawerClose = () => {
    this.setState({
      drawerOpen: false,
      drawerItem: null,
    });
  };

  render() {
    const { classes, healthData } = this.props;
    const { sortBy, sortDirection, drawerOpen, drawerItem } = this.state;
    const sortedHealth = this.createSortedHealth(
      healthData,
      sortBy,
      sortDirection
    );

    return (
      <Fragment>
        <DataTable
          items={sortedHealth}
          headers={['AZ', 'Region', 'Instance Type', 'Healthy', 'Unhealthy']}
          sortByHeader={sortBy}
          sortDirection={sortDirection}
          onHeaderClick={this.handleHeaderClick}
          noItemsMessage="Health stats not available"
          renderRow={item => (
            <TableRow key={`${item.az}-${item.region}-${item.instanceType}`}>
              <TableCell>
                <TableCellListItem dense>
                  <ListItemText primary={item.az} />
                </TableCellListItem>
              </TableCell>
              <TableCell>
                <TableCellListItem dense>
                  <ListItemText primary={item.region} />
                </TableCellListItem>
              </TableCell>
              <TableCell>
                <TableCellListItem dense>
                  <ListItemText primary={item.instanceType} />
                </TableCellListItem>
              </TableCell>
              <TableCell>
                <TableCellListItem
                  button
                  dense
                  onClick={() => this.handleDrawerOpen(item, 'Healthy')}>
                  <ListItemText primary={or0(item.healthy)} />
                  <InformationVariantIcon size={iconSize} />
                </TableCellListItem>
              </TableCell>
              <TableCell>
                <TableCellListItem
                  button
                  dense
                  onClick={() => this.handleDrawerOpen(item, 'Unhealthy')}>
                  <ListItemText primary={or0(item.unhealthy)} />
                  <InformationVariantIcon size={iconSize} />
                </TableCellListItem>
              </TableCell>
            </TableRow>
          )}
        />
        <Drawer
          anchor="right"
          open={drawerOpen}
          onClose={this.handleDrawerClose}>
          <div className={classes.drawerContainer}>
            <Typography variant="headline" className={classes.headline}>
              {drawerItem && drawerItem.columnName}
            </Typography>
            {drawerItem &&
              drawerItem.columnName === 'Healthy' && (
                <List>
                  <ListItem>
                    <ListItemText
                      primary="Successful Requests"
                      secondary={or0(drawerItem.successful)}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Clean Shutdown"
                      secondary={or0(drawerItem.cleanShutdown)}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Running"
                      secondary={or0(drawerItem.running)}
                    />
                  </ListItem>
                </List>
              )}
            {drawerItem &&
              drawerItem.columnName === 'Unhealthy' && (
                <List>
                  <ListItem>
                    <ListItemText
                      primary="Failed Requests"
                      secondary={or0(drawerItem.failed)}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Spot Kill"
                      secondary={or0(drawerItem.spotKill)}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Insufficient Capacity"
                      secondary={or0(drawerItem.insufficientCapacity)}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Volume Limit Exceeded"
                      secondary={or0(drawerItem.volumeLimitExceeded)}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Missing AMI"
                      secondary={or0(drawerItem.missingAmi)}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Unknown Codes"
                      secondary={or0(drawerItem.unknownCodes)}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="No Codes"
                      secondary={or0(drawerItem.noCode)}
                    />
                  </ListItem>
                </List>
              )}
          </div>
        </Drawer>
      </Fragment>
    );
  }
}
