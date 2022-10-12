import React, { Component } from 'react';
import { object } from 'prop-types';
import { Grid, Paper, withStyles, Typography } from '@material-ui/core';
import { Link } from 'react-router-dom';
import summarizeWorkerPools from './summarizeWorkerPools';
import summarizeProvisioners from './summarizeProvisioners';
import summarizeHooks from './summarizeHooks';
import summarizeAuthorization from './summarizeAuthorization';

const getLength = value => String(value).length;
const Item = ({
  title,
  value,
  classMain,
  classValue,
  hint,
  error,
  altColor = false,
}) => (
  <Paper className={classMain}>
    <Typography variant="h5">
      {title}
      {hint && (
        <abbr title={hint} style={{ marginLeft: 5 }}>
          ?
        </abbr>
      )}
    </Typography>
    <abbr title={error}>
      <Typography
        className={classValue}
        style={altColor ? { color: '#51e9f1' } : {}}
        variant={getLength(value) < 10 ? 'h2' : 'h4'}>
        {value}
      </Typography>
    </abbr>
  </Paper>
);

@withStyles(theme => ({
  grid: {
    marginTop: theme.spacing(4),
  },
  item: {
    backgroundColor: theme.palette.type === 'dark' ? '#444' : '#eee',
    ...theme.typography.body1,
    padding: theme.spacing(1),
    textAlign: 'center',
    color:
      theme.palette.type === 'dark'
        ? theme.palette.text.primary
        : theme.palette.text.secondary,
  },
  itemValue: {
    color: theme.palette.warning.main,
    overflow: 'hidden',
    minHeight: theme.spacing(10),
    display: 'inline-flex',
    alignItems: 'center',
  },
}))
export default class StatusDashboard extends Component {
  static propTypes = {
    workerPools: object,
    provisioners: object,
    hookGroups: object,
    clients: object,
    secrets: object,
    roles: object,
  };

  static defaultProps = {
    workerPools: {},
    provisioners: {},
    hookGroups: {},
    clients: {},
    secrets: {},
    roles: {},
  };

  render() {
    const {
      classes,
      workerPools,
      provisioners,
      hookGroups,
      clients,
      roles,
      secrets,
    } = this.props;
    const filterAvailable = items =>
      items.filter(item => !item.loading && !item.error);
    const widgets = {
      'Worker Manager Stats': filterAvailable(
        summarizeWorkerPools(workerPools)
      ),
      'Worker Provisioners': filterAvailable(
        summarizeProvisioners(provisioners)
      ),
      Hooks: filterAvailable(summarizeHooks(hookGroups)),
      Authorization: filterAvailable(
        summarizeAuthorization(clients, roles, secrets)
      ),
    };

    return (
      <Grid container spacing={2} className={classes.grid}>
        {Object.keys(widgets)
          .filter(group => widgets[group].length > 0)
          .map(group => (
            <React.Fragment key={group}>
              <Grid item xs={12}>
                <Typography variant="h5">{group}</Typography>
              </Grid>
              {widgets[group].map(props => (
                <Grid item xs={12} sm={6} md={4} key={props.title}>
                  {props.link ? (
                    <Link to={props.link}>
                      <Item
                        classMain={classes.item}
                        classValue={classes.itemValue}
                        {...props}
                      />
                    </Link>
                  ) : (
                    <Item
                      classMain={classes.item}
                      classValue={classes.itemValue}
                      {...props}
                    />
                  )}
                </Grid>
              ))}
            </React.Fragment>
          ))}
      </Grid>
    );
  }
}
