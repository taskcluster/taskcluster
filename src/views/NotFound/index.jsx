import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Dashboard from '../../components/Dashboard';
import Emoticon from './Emoticon';

@hot(module)
@withStyles(
  theme => ({
    root: {
      textAlign: 'center',
    },
    emoticon: {
      position: 'fixed',
      width: `calc(100% - ${theme.drawerWidth}px)`,
      height: '50%',
      right: 0,
    },
    typography: {
      fontFamily: 'Roboto500',
    },
    icon: {
      fill: theme.palette.primary.main,
    },
  }),
  { withTheme: true }
)
export default class NotFound extends Component {
  render() {
    const { classes, user, onSignIn, onSignOut, theme } = this.props;

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
        <Emoticon
          className={classes.emoticon}
          fill={theme.palette.text.primary}
        />
      </Dashboard>
    );
  }
}
