import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import { withStyles } from '@material-ui/core/styles';
import Tooltip from '@material-ui/core/Tooltip';
import ArrowRightIcon from 'mdi-react/ArrowRightIcon';
import Dashboard from '../../../components/Dashboard';
import Button from '../../../components/Button';
import Log from '../../../components/Log';

@hot(module)
@withStyles(theme => ({
  fab: {
    position: 'absolute',
    right: theme.spacing.double,
    top: theme.spacing.double,
    ...theme.mixins.fabIcon,
  },
  miniFab: {
    position: 'absolute',
    right: theme.spacing.unit * 10,
    top: theme.spacing.triple,
  },
  rawLogButton: {
    position: 'absolute',
    right: theme.spacing.unit * 16,
    top: theme.spacing.triple,
  },
}))
export default class TaskLog extends Component {
  render() {
    const { classes, match } = this.props;
    const url = decodeURIComponent(match.params.logUrl);

    return (
      <Dashboard disablePadding>
        <Log
          url={url}
          stream={false}
          GoToLineButtonProps={{ className: classes.miniFab }}
          RawLogButtonProps={{ className: classes.rawLogButton }}
          actions={
            <Tooltip placement="bottom" title="View task">
              <Button
                component={Link}
                to={`/tasks/${match.params.taskId}/runs/${match.params.runId}`}
                variant="round"
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
