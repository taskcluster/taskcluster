import React, { PureComponent } from 'react';
import { withStyles } from '@material-ui/core/styles';
import CircularProgress from '@material-ui/core/CircularProgress';

@withStyles(theme => ({
  view: {
    textAlign: 'center',
    margin: 100,
    width: '100%',
    flexGrow: 1,
    backgroundColor: theme.palette.background.default,
    padding: 24,
    height: 'calc(100% - 56px)',
    marginTop: 56,
    overflowX: 'auto',
    [theme.breakpoints.up('sm')]: {
      height: 'calc(100% - 64px)',
      marginTop: 64,
    },
  },
  spinner: {
    color: theme.palette.primary[50],
  },
  errorIcon: {
    fontSize: 48,
  },
}))
export default class Loading extends PureComponent {
  render() {
    const { classes } = this.props;

    return (
      <div className={classes.view}>
        <CircularProgress
          size={50}
          classes={{
            circleIndeterminate: classes.spinner,
          }}
        />
      </div>
    );
  }
}
