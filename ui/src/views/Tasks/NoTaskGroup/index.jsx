import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListSubheader from '@material-ui/core/ListSubheader';
import LinkIcon from 'mdi-react/LinkIcon';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
import Link from '../../../utils/Link';
import db from '../../../utils/db';

@hot(module)
@withStyles(theme => ({
  infoText: {
    marginBottom: theme.spacing(1),
  },
  listItemButton: {
    ...theme.mixins.listItemButton,
    display: 'flex',
    justifyContent: 'space-between',
  },
}))
export default class NoTaskGroup extends Component {
  state = {
    recentTaskGroups: null,
  };

  async componentDidMount() {
    const recentTaskGroups = await db.taskGroupIdsHistory
      .limit(5)
      .reverse()
      .toArray();

    this.setState({ recentTaskGroups });
  }

  handleTaskGroupSearchSubmit = taskGroupId => {
    this.props.history.push(`/tasks/groups/${taskGroupId}`);
  };

  render() {
    const { classes, description } = this.props;
    const { recentTaskGroups } = this.state;

    return (
      <Dashboard
        title="Task Groups"
        helpView={<HelpView description={description} />}
        search={
          <Search
            placeholder="Search Task Group ID"
            onSubmit={this.handleTaskGroupSearchSubmit}
          />
        }>
        <Typography variant="body2" className={classes.infoText}>
          Enter a task group ID in the search box
        </Typography>
        {recentTaskGroups && Boolean(recentTaskGroups.length) && (
          <List
            dense
            subheader={
              <ListSubheader component="div">Recent Task Groups</ListSubheader>
            }>
            {recentTaskGroups.map(({ taskGroupId }) => (
              <Link key={taskGroupId} to={`/tasks/groups/${taskGroupId}`}>
                <ListItem button className={classes.listItemButton}>
                  {taskGroupId}
                  <LinkIcon />
                </ListItem>
              </Link>
            ))}
          </List>
        )}
      </Dashboard>
    );
  }
}
