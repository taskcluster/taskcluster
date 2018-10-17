import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListSubheader from '@material-ui/core/ListSubheader';
import LinkIcon from 'mdi-react/LinkIcon';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
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
    const { description, classes } = this.props;
    const { taskSearch, recentTasks } = this.state;

    return (
      <Dashboard
        helpView={<HelpView description={description} />}
        search={
          <Search
            value={taskSearch}
            onChange={this.handleTaskSearchChange}
            onSubmit={this.handleTaskSearchSubmit}
          />
        }
      >
        <Typography className={classes.infoText}>
          Enter a task ID in the search box
        </Typography>
        {recentTasks &&
          Boolean(recentTasks.length) && (
            <List
              dense
              subheader={
                <ListSubheader component="div">Recent Tasks</ListSubheader>
              }
            >
              {recentTasks.map(({ taskId }) => (
                <ListItem
                  button
                  className={classes.listItemButton}
                  component={Link}
                  to={`/tasks/${taskId}`}
                  key={taskId}
                >
                  <ListItemText primary={taskId} />
                  <LinkIcon />
                </ListItem>
              ))}
            </List>
          )}
      </Dashboard>
    );
  }
}
