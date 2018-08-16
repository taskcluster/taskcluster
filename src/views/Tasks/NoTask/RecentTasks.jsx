import { Component, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { graphql } from 'react-apollo';
import { shape, arrayOf, string } from 'prop-types';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListSubheader from '@material-ui/core/ListSubheader';
import ListItemText from '@material-ui/core/ListItemText';
import LinkIcon from 'mdi-react/LinkIcon';
import StatusLabel from '../../../components/StatusLabel';
import recentTasksQuery from './recentTask.graphql';

@graphql(recentTasksQuery, {
  options: props => ({
    variables: {
      taskIds: props.tasks.map(({ taskId }) => taskId),
    },
  }),
})
@withStyles(theme => ({
  infoText: {
    marginBottom: theme.spacing.unit,
  },
  listItemButton: {
    ...theme.mixins.listItemButton,
  },
}))
export default class RecentTasks extends Component {
  static propTypes = {
    /** A list of recent tasks */
    tasks: arrayOf(
      shape({
        taskId: string,
      })
    ).isRequired,
  };

  render() {
    const {
      classes,
      data: { loading, error, tasks },
    } = this.props;

    return (
      <Fragment>
        {loading && <Spinner />}
        {!loading && (
          <Fragment>
            {error && <ErrorPanel error={error} />}
            {tasks && tasks.length ? (
              <List
                dense
                subheader={
                  <ListSubheader component="div">Recent Tasks</ListSubheader>
                }>
                {tasks.map(task => (
                  <ListItem
                    button
                    className={classes.listItemButton}
                    component={Link}
                    to={`/tasks/${task.taskId}`}
                    key={task.taskId}>
                    <StatusLabel state={task.status.state} />
                    <ListItemText primary={task.metadata.name} />
                    <LinkIcon />
                  </ListItem>
                ))}
              </List>
            ) : null}
          </Fragment>
        )}
      </Fragment>
    );
  }
}
