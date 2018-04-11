import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { Link } from 'react-router-dom';
import { withStyles } from 'material-ui/styles';
import Button from 'material-ui/Button';
import Tooltip from 'material-ui/Tooltip';
import ArrowRightIcon from 'mdi-react/ArrowRightIcon';
import Dashboard from '../../../components/Dashboard';
import Log from '../../../components/Log';

@hot(module)
@withStyles(theme => ({
  fab: {
    position: 'absolute',
    right: theme.spacing.double,
    top: theme.spacing.double,
  },
  goToLineButton: {
    position: 'absolute',
    right: theme.spacing.unit * 10,
    top: theme.spacing.triple,
  },
  followButton: {
    position: 'absolute',
    right: theme.spacing.unit * 16,
    top: theme.spacing.triple,
  },
  rawLogButton: {
    position: 'absolute',
    right: theme.spacing.unit * 22,
    top: theme.spacing.triple,
  },
}))
export default class LiveTaskLog extends Component {
  render() {
    const { classes, user, onSignIn, onSignOut, match } = this.props;
    const url = decodeURIComponent(match.params.logUrl);

    return (
      <Dashboard
        user={user}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        disablePadding>
        <Log
          url={url}
          stream
          GoToLineButtonProps={{ className: classes.goToLineButton }}
          FollowLogButtonProps={{ className: classes.followButton }}
          RawLogButtonProps={{ className: classes.rawLogButton }}
          actions={
            <Tooltip placement="bottom" title="View task">
              <Button
                component={Link}
                to={`/tasks/${match.params.taskId}/runs/${match.params.runId}`}
                variant="fab"
                className={classes.fab}
                color="secondary">
                <ArrowRightIcon />
              </Button>
            </Tooltip>
          }
        />
      </Dashboard>
    );
  }
}
