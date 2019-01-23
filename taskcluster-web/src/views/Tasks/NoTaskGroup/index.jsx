import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListSubheader from '@material-ui/core/ListSubheader';
import LinkIcon from 'mdi-react/LinkIcon';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
import db from '../../../utils/db';

@hot(module)
@withStyles(theme => ({
  infoText: {
    marginBottom: theme.spacing.unit,
  },
  listItemButton: {
    ...theme.mixins.listItemButton,
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
        helpView={<HelpView description={description} />}
        search={<Search onSubmit={this.handleTaskGroupSearchSubmit} />}>
        <Typography className={classes.infoText}>
          Enter a task group ID in the search box
        </Typography>
        {recentTaskGroups &&
          Boolean(recentTaskGroups.length) && (
            <List
              dense
              subheader={
                <ListSubheader component="div">
                  Recent Task Groups
                </ListSubheader>
              }>
              {recentTaskGroups.map(({ taskGroupId }) => (
                <ListItem
                  button
                  className={classes.listItemButton}
                  component={Link}
                  to={`/tasks/groups/${taskGroupId}`}
                  key={taskGroupId}>
                  <ListItemText primary={taskGroupId} />
                  <LinkIcon />
                </ListItem>
              ))}
            </List>
          )}
      </Dashboard>
    );
  }
}
