import { PureComponent } from 'react';
import Loadable from 'react-loadable';
import { withStyles } from 'material-ui/styles';
import { CircularProgress } from 'material-ui/Progress';

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
      marginTop: 64
    }
  },
  spinner: {
    color: theme.palette.primary[50]
  },
  errorIcon: {
    fontSize: 48
  }
}))
class Loading extends PureComponent {
  content() {
    const { classes, error, timedOut, pastDelay } = this.props;

    if (error) {
      throw error;
    } else if (timedOut || pastDelay) {
      return (
        <CircularProgress
          size={50}
          classes={{
            circleIndeterminate: classes.spinner
          }}
        />
      );
    }

    return null;
  }

  render() {
    const { classes } = this.props;

    return <div className={classes.view}>{this.content()}</div>;
  }
}

export default loader =>
  Loadable({
    loader,
    loading: Loading
  });
