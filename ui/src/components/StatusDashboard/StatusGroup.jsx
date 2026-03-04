import React from 'react';
import { Grid, withStyles, Typography } from '@material-ui/core';
import { Link } from 'react-router-dom';
import { StatusItem } from './StatusItem';

const styles = theme => ({
  grid: {
    marginTop: theme.spacing(4),
  },
  tinyGrid: {
    marginTop: theme.spacing(0),
  },
  item: {
    backgroundColor: theme.palette.type === 'dark' ? '#444' : '#eee',
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
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: theme.spacing(10),
  },
  itemValueTiny: {
    minHeight: theme.spacing(7.5),
    color: theme.palette.warning.main,
    overflow: 'hidden',
    display: 'inline-flex',
    alignItems: 'center',
  },
});
const StatusGroup = ({ widgets, showTitle = true, tiny = false, classes }) => {
  return (
    <Grid
      container
      spacing={2}
      className={tiny ? classes.tinyGrid : classes.grid}>
      {Object.keys(widgets)
        .filter(group => widgets[group].length > 0)
        .map(group => (
          <React.Fragment key={group}>
            {showTitle && (
              <Grid item xs={12}>
                <Typography>{group}</Typography>
              </Grid>
            )}
            {widgets[group].map(props => (
              <Grid item xs={12} sm={6} md={3} key={props.title}>
                {props.link ? (
                  <Link to={props.link}>
                    <StatusItem
                      classMain={classes.item}
                      classValue={
                        tiny ? classes.itemValueTiny : classes.itemValue
                      }
                      tiny={tiny}
                      {...props}
                    />
                  </Link>
                ) : (
                  <StatusItem
                    classMain={classes.item}
                    classValue={
                      tiny ? classes.itemValueTiny : classes.itemValue
                    }
                    tiny={tiny}
                    {...props}
                  />
                )}
              </Grid>
            ))}
          </React.Fragment>
        ))}
    </Grid>
  );
};

export default withStyles(styles)(StatusGroup);
