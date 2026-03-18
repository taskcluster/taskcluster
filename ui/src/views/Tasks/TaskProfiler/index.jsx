import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import React, { Component } from 'react';
import Breadcrumbs from '../../../components/Breadcrumbs';
import Button from '../../../components/Button';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
import { VALID_TASK } from '../../../utils/constants';
import Link from '../../../utils/Link';

@withStyles((theme) => ({
  openButton: {
    marginTop: theme.spacing(2),
  },
  helpText: {
    marginTop: theme.spacing(2),
  },
}))
export default class TaskProfiler extends Component {
  get isTaskGroupMode() {
    return Boolean(this.props.match.params.taskGroupId);
  }

  get currentId() {
    const { taskGroupId, taskId } = this.props.match.params;

    return taskGroupId || taskId;
  }

  getProfilerUrl = () => {
    const { taskGroupId, taskId } = this.props.match.params;
    let profileUrl;

    if (taskGroupId) {
      profileUrl = `${window.env.TASKCLUSTER_ROOT_URL}/api/web-server/v1/task-group/${taskGroupId}/profile`;
    } else {
      profileUrl = `${window.env.TASKCLUSTER_ROOT_URL}/api/web-server/v1/task/${taskId}/profile`;
    }

    return `https://profiler.firefox.com/from-url/${encodeURIComponent(profileUrl)}`;
  };

  handleOpenProfiler = () => {
    window.open(this.getProfilerUrl(), '_blank');
  };

  handleSearchSubmit = (value) => {
    if (!value || !VALID_TASK.test(value)) {
      return;
    }

    this.props.history.push(`/tasks/groups/${value}/profiler`);
  };

  render() {
    const { description, classes } = this.props;

    return (
      <Dashboard
        title="Task Profiler"
        helpView={<HelpView description={description} />}
        search={<Search placeholder="Task Group ID" onSubmit={this.handleSearchSubmit} />}
      >
        <Breadcrumbs>
          {this.isTaskGroupMode ? (
            <Link to={`/tasks/groups/${this.currentId}`}>
              <Typography variant="body2">Task Group {this.currentId}</Typography>
            </Link>
          ) : (
            <Link to={`/tasks/${this.currentId}`}>
              <Typography variant="body2">Task {this.currentId}</Typography>
            </Link>
          )}
          <Typography variant="body2" color="textSecondary">
            Profiler
          </Typography>
        </Breadcrumbs>
        {this.currentId && (
          <React.Fragment>
            <Button
              variant="contained"
              color="primary"
              className={classes.openButton}
              onClick={this.handleOpenProfiler}
            >
              Open in Firefox Profiler
            </Button>
            <Typography variant="body2" color="textSecondary" className={classes.helpText}>
              Opens profiler.firefox.com with the task data. If the popup is blocked, check your browser settings.
            </Typography>
          </React.Fragment>
        )}
      </Dashboard>
    );
  }
}
