import { hot } from 'react-hot-loader';
import { Component, Fragment } from 'react';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import RecentTasks from './RecentTasks';
import db from '../../../utils/db';

@hot(module)
@withStyles(theme => ({
  infoText: {
    marginBottom: theme.spacing.unit,
  },
}))
export default class NoTask extends Component {
  state = {
    recentTasks: null,
    taskSearch: '',
  };

  async componentDidMount() {
    const recentTasks = await db.taskIdsHistory
      .limit(5)
      .reverse()
      .toArray();

    this.setState({ recentTasks });
  }

  handleTaskSearchChange = e => {
    this.setState({ taskSearch: e.target.value || '' });
  };

  handleTaskSearchSubmit = e => {
    e.preventDefault();
    this.props.history.push(`/tasks/${this.state.taskSearch}`);
  };

  render() {
    const { classes } = this.props;
    const { taskSearch, recentTasks } = this.state;

    return (
      <Dashboard
        search={
          <Search
            value={taskSearch}
            onChange={this.handleTaskSearchChange}
            onSubmit={this.handleTaskSearchSubmit}
          />
        }>
        <Fragment>
          <Typography className={classes.infoText}>
            Enter a task ID in the search box
          </Typography>
          {recentTasks ? <RecentTasks tasks={recentTasks} /> : <Spinner />}
        </Fragment>
      </Dashboard>
    );
  }
}
