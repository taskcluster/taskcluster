import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { withStyles } from 'material-ui/styles';
import Typography from 'material-ui/Typography';
import Dashboard from '../../components/Dashboard';
import emoticonUrl from './emoticon-neutral.svg';

@hot(module)
@withStyles(theme => ({
  root: {
    textAlign: 'center',
    backgroundImage: `url(${emoticonUrl})`,
    backgroundAttachment: 'fixed',
    backgroundSize: '50%',
    backgroundPosition: 'center center',
    backgroundRepeat: 'no-repeat',
    [theme.breakpoints.up('md')]: {
      backgroundPosition: `calc(50% + ${theme.drawerWidth / 2}px) center`,
      backgroundSize: '30%',
    },
  },
  typography: {
    fontFamily: 'Roboto500',
  },
  icon: {
    fill: theme.palette.primary.main,
  },
}))
export default class NotFound extends Component {
  render() {
    const { classes, user, onSignIn, onSignOut } = this.props;

    return (
      <Dashboard
        user={user}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        className={classes.root}>
        <Typography variant="display4" className={classes.typography}>
          404
        </Typography>
        <Typography variant="display1" className={classes.typography}>
          We couldn&apos;t find a page at that address.<br />
          <br />
          <br />
        </Typography>
      </Dashboard>
    );
  }
}
