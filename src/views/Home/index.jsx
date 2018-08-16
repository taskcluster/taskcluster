import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import Divider from '@material-ui/core/Divider';
import Hidden from '@material-ui/core/Hidden';
import Typography from '@material-ui/core/Typography';
import AccountCircleIcon from 'mdi-react/AccountCircleIcon';
import Button from '../../components/Button';
import Landing from '../../components/Landing';
import SignInDialog from '../../components/SignInDialog';

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
    marginRight: theme.spacing.unit,
  },
}))
export default class Home extends Component {
  state = {
    signInDialogOpen: false,
  };

  handleOpenSignInDialog = () => {
    this.setState({ signInDialogOpen: true });
  };

  handleCloseSignInDialog = () => {
    this.setState({ signInDialogOpen: false });
  };

  render() {
    const { classes } = this.props;
    const { signInDialogOpen } = this.state;

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
          <Button
            variant="raised"
            color="default"
            onClick={this.handleOpenSignInDialog}>
            <AccountCircleIcon className={classes.icon} />
            Sign in
          </Button>
          <SignInDialog
            open={signInDialogOpen}
            onClose={this.handleCloseSignInDialog}
          />
        </div>
      </Landing>
    );
  }
}
