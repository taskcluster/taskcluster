import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import Divider from '@material-ui/core/Divider';
import Hidden from '@material-ui/core/Hidden';
import Typography from '@material-ui/core/Typography';
import ArrowRightIcon from 'mdi-react/ArrowRightIcon';
import Landing from '../../components/Landing';

@hot(module)
@withStyles(theme => ({
  root: {
    padding: theme.spacing.unit * 10,
    [theme.breakpoints.down('sm')]: {
      padding: theme.spacing.unit * 5,
    },
  },
  headline: {
    color: theme.palette.common.white,
    fontFamily: 'Roboto500',
    [theme.breakpoints.down('sm')]: {
      marginBottom: theme.spacing.double,
    },
  },
  actions: {
    marginTop: theme.spacing.triple,
  },
  divider: {
    margin: `${theme.spacing.unit * 10}px 0 ${theme.spacing.triple}px`,
    [theme.breakpoints.down('sm')]: {
      margin: `${theme.spacing.unit * 5}px 0 ${theme.spacing.double}px`,
    },
  },
  icon: {
    fill: theme.palette.primary.main,
    marginLeft: theme.spacing.double,
  },
}))
export default class Home extends Component {
  render() {
    const { classes, onSignIn } = this.props;

    return (
      <Landing className={classes.root}>
        <Hidden xsDown implementation="css">
          <Typography variant="display4" className={classes.headline}>
            {process.env.APPLICATION_NAME}
          </Typography>
        </Hidden>
        <Hidden smUp implementation="css">
          <Typography variant="display3" className={classes.headline}>
            {process.env.APPLICATION_NAME}
          </Typography>
        </Hidden>
        <Typography variant="headline">
          Gather insight and intelligence for the build systems and pipelines
          that create your software.
        </Typography>
        <Divider className={classes.divider} />
        <div className={classes.actions}>
          <Button variant="raised" color="default" onClick={onSignIn}>
            Sign in to get started
            <ArrowRightIcon className={classes.icon} />
          </Button>
        </div>
      </Landing>
    );
  }
}
