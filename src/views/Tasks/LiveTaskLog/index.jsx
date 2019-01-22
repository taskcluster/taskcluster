import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import { withStyles } from '@material-ui/core/styles';
import ArrowRightIcon from 'mdi-react/ArrowRightIcon';
import Dashboard from '../../../components/Dashboard';
import Button from '../../../components/Button';
import Log from '../../../components/Log';

@hot(module)
@withStyles(theme => ({
  fab: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
    bottom: theme.spacing.triple,
    right: theme.spacing.triple,
  },
  goToLineButton: {
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
export default class LiveTaskLog extends Component {
  render() {
    const { classes, match } = this.props;
    const url = decodeURIComponent(match.params.logUrl);

    return (
      <Dashboard disablePadding>
        <Log
          url={url}
          stream
          GoToLineButtonProps={{ className: classes.goToLineButton }}
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
