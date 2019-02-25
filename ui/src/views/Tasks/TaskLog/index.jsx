import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import ArrowRightIcon from 'mdi-react/ArrowRightIcon';
import Dashboard from '../../../components/Dashboard';
import Button from '../../../components/Button';
import Log from '../../../components/Log';
import Link from '../../../utils/Link';

@hot(module)
@withStyles(theme => ({
  fab: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
    bottom: theme.spacing.triple,
  },
  miniFab: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
    bottom: theme.spacing.triple,
    right: theme.spacing.unit * 11,
  },
  followButton: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
    bottom: theme.spacing.triple,
    right: theme.spacing.unit * 19,
  },
  rawLogButton: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
    bottom: theme.spacing.triple,
    right: theme.spacing.unit * 27,
  },
}))
export default class TaskLog extends Component {
  render() {
    const { classes, match, stream } = this.props;
    const url = decodeURIComponent(match.params.logUrl);

    return (
      <Dashboard title="Log" disablePadding>
        <Log
          url={url}
          stream={stream}
          GoToLineButtonProps={{ className: classes.miniFab }}
          FollowLogButtonProps={{ className: classes.followButton }}
          RawLogButtonProps={{ className: classes.rawLogButton }}
          actions={
            <Button
              spanProps={{ className: classes.fab }}
              tooltipProps={{ title: 'View Task' }}
              component={Link}
              to={`/tasks/${match.params.taskId}/runs/${match.params.runId}`}
              variant="round"
              color="secondary">
              <ArrowRightIcon />
            </Button>
          }
        />
      </Dashboard>
    );
  }
}
