import React, { Component, useState, useEffect } from 'react';
import { object } from 'prop-types';
import { Grid, Paper, withStyles, Typography } from '@material-ui/core';
import { Link } from 'react-router-dom';
import summarizeWorkerPools from './summarizeWorkerPools';
import summarizeWorkerPoolsStats from './summarizeWorkerPoolsStats';
import summarizeProvisioners from './summarizeProvisioners';
import summarizeHooks from './summarizeHooks';
import summarizeAuthorization from './summarizeAuthorization';

const getLength = value => String(value).length;
const MiniSvgGraph = ({ data, width = 130, height = 72 }) => {
  const [path, setPath] = useState('');

  useEffect(() => {
    const max = Math.max(1, Math.max(...data)); // avoid devision by 0
    const path = data
      .map((value, index) => {
        const x = (width * index) / (data.length - 1);
        const y = height - (height * value) / max;

        return `${x},${y}`;
      })
      .join(' ');

    setPath(path);
  }, [data, width, height]);

  return (
    <svg width={width} height={height}>
      <polyline
        points={path}
        fill="none"
        stroke="#FF4500"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const Item = ({
  title,
  type,
  value,
  classMain,
  classValue,
  hint,
  error,
  altColor = false,
}) => {
  const [styles, setStyles] = useState({});

  useEffect(() => {
    setStyles({ backgroundColor: '#A459D1' });
    setTimeout(() => setStyles({}), 2000);
  }, [value]);

  return (
    <Paper className={classMain} style={styles}>
      <Typography variant="h5">
        {title}
        {hint && (
          <abbr title={hint} style={{ marginLeft: 5 }}>
            ?
          </abbr>
        )}
      </Typography>
      <abbr title={error}>
        {type === 'graph' && (
          <MiniSvgGraph data={value} className={classValue} />
        )}
        {(!type || type !== 'graph') && (
          <Typography
            className={classValue}
            style={altColor ? { color: '#51e9f1' } : {}}
            variant={getLength(value) < 10 ? 'h2' : 'h4'}>
            {value}
          </Typography>
        )}
      </abbr>
    </Paper>
  );
};

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
    transition: 'all 0.8s ease-in-out',
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
    wmStats: object,
  };

  static defaultProps = {
    workerPools: {},
    provisioners: {},
    hookGroups: {},
    clients: {},
    secrets: {},
    roles: {},
    wmStats: {},
  };

  render() {
    const {
      classes,
      workerPools,
      wmStats,
      provisioners,
      hookGroups,
      clients,
      roles,
      secrets,
    } = this.props;
    const filterAvailable = items =>
      items.filter(item => !item.loading && !item.error);
    const widgets = {
      'Worker Manager Provisioning': filterAvailable(
        summarizeWorkerPools(workerPools, 'provisioning')
      ),
      'Worker Manager Errors': summarizeWorkerPoolsStats(wmStats),
      'Worker Manager Stats': filterAvailable(
        summarizeWorkerPools(workerPools, 'stats')
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
                <Grid item xs={12} sm={6} md={3} key={props.title}>
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
