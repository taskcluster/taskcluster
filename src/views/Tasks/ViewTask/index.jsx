import { hot } from 'react-hot-loader';
import { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import { withStyles } from 'material-ui/styles';
import Divider from 'material-ui/Divider';
import Grid from 'material-ui/Grid';
import Typography from 'material-ui/Typography';
import dotProp from 'dot-prop-immutable';
import Dashboard from '../../../components/Dashboard';
import TaskDetailsCard from '../../../components/TaskDetailsCard';
import TaskRunsCard from '../../../components/TaskRunsCard';
import TaskSearch from '../../../components/TaskSearch';
import Query from '../../../components/Query';
import Markdown from '../../../components/Markdown';
import { ARTIFACTS_PAGE_SIZE } from '../../../utils/constants';
import taskQuery from './task.graphql';
import pageArtifactsQuery from './pageArtifacts.graphql';

@hot(module)
@withStyles(theme => ({
  title: {
    marginBottom: theme.spacing.unit,
  },
  divider: {
    margin: `${theme.spacing.triple}px 0`,
  },
  owner: {
    textAlign: 'right',
    [theme.breakpoints.down('xs')]: {
      textAlign: 'left',
    },
  },
}))
@graphql(taskQuery, {
  skip: props => !props.match.params.taskId,
  options: props => ({
    variables: {
      taskId: props.match.params.taskId,
      artifactsConnection: {
        limit: ARTIFACTS_PAGE_SIZE,
      },
    },
  }),
})
export default class ViewTask extends Component {
  static getDerivedStateFromProps(nextProps, prevState) {
    if (nextProps.match.params.taskId !== prevState.taskSearch) {
      return {
        taskSearch: nextProps.match.params.taskId || '',
      };
    }

    return null;
  }

  state = {
    taskSearch: '',
  };

  handleTaskSearchChange = e => {
    this.setState({ taskSearch: e.target.value || '' });
  };

  handleTaskSearchSubmit = e => {
    e.preventDefault();
    this.props.history.push(`/tasks/${this.state.taskSearch}`);
  };

  handleArtifactsPageChange = ({ cursor, previousCursor, runId }) => {
    const { task, fetchMore } = this.props.data;

    return fetchMore({
      query: pageArtifactsQuery,
      variables: {
        runId,
        taskId: task.taskId,
        connection: {
          limit: ARTIFACTS_PAGE_SIZE,
          cursor,
          previousCursor,
        },
      },
      updateQuery(previousResult, { fetchMoreResult }) {
        const { edges, pageInfo } = fetchMoreResult.artifacts;

        if (!edges.length) {
          return previousResult;
        }

        return dotProp.set(
          previousResult,
          `task.status.runs.${runId}.artifacts`,
          artifacts =>
            dotProp.set(
              dotProp.set(artifacts, 'edges', edges),
              'pageInfo',
              pageInfo
            )
        );
      },
    });
  };

  renderTask() {
    const { classes, data: { task, loading, error } } = this.props;

    return (
      <Query loading={loading} error={error}>
        {() => (
          <Fragment>
            <Typography variant="headline" className={classes.title}>
              {task.metadata.name}
            </Typography>
            <Grid container spacing={16}>
              <Grid item xs={12} sm={6}>
                <Typography variant="subheading">
                  <Markdown>{task.metadata.description}</Markdown>
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} className={classes.owner}>
                <Typography variant="subheading">
                  <small>Owned by: </small>
                  <code>{task.metadata.owner}</code>
                </Typography>
              </Grid>
            </Grid>
            <Divider className={classes.divider} />
            <Grid container spacing={24}>
              <Grid item xs={12} md={6}>
                <TaskDetailsCard task={task} />
              </Grid>

              <Grid item xs={12} md={6}>
                <TaskRunsCard
                  runs={task.status.runs}
                  workerType={task.workerType}
                  provisionerId={task.provisionerId}
                  onArtifactsPageChange={this.handleArtifactsPageChange}
                />
              </Grid>
            </Grid>
          </Fragment>
        )}
      </Query>
    );
  }

  render() {
    const { match, user, onSignIn, onSignOut } = this.props;
    const { taskSearch } = this.state;
    const { taskId } = match.params;

    // TODO: If there isn't a selected task, fill with recent task cards
    return (
      <Dashboard
        user={user}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        search={
          <TaskSearch
            value={taskSearch}
            onChange={this.handleTaskSearchChange}
            onSubmit={this.handleTaskSearchSubmit}
          />
        }>
        {taskId && this.renderTask()}
        {!taskId && <span>Enter a task ID in the search box</span>}
      </Dashboard>
    );
  }
}
