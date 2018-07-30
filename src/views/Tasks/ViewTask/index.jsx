import { hot } from 'react-hot-loader';
import { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Markdown from '@mozilla-frontend-infra/components/Markdown';
import { withStyles } from '@material-ui/core/styles';
import Chip from '@material-ui/core/Chip';
import Divider from '@material-ui/core/Divider';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import dotProp from 'dot-prop-immutable';
import Dashboard from '../../../components/Dashboard';
import TaskDetailsCard from '../../../components/TaskDetailsCard';
import TaskRunsCard from '../../../components/TaskRunsCard';
import Search from '../../../components/Search';
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
    marginTop: theme.spacing.unit,
  },
}))
@graphql(taskQuery, {
  skip: props => !props.match.params.taskId,
  options: props => ({
    errorPolicy: 'all',
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
    return {
      taskSearch:
        nextProps.match.params.taskId !== prevState.taskSearch
          ? nextProps.match.params.taskId || ''
          : prevState.taskSearch,
      showError: !!nextProps.data.error,
    };
  }

  state = {
    taskSearch: '',
    showError: false,
  };

  handleHideError = () => {
    this.setState({
      showError: false,
    });
  };

  handleTaskSearchChange = e => {
    this.setState({ taskSearch: e.target.value || '' });
  };

  handleTaskSearchSubmit = e => {
    e.preventDefault();
    this.props.history.push(`/tasks/${this.state.taskSearch}`);
  };

  handleArtifactsPageChange = ({ cursor, previousCursor }) => {
    const {
      match,
      data: { task, fetchMore },
    } = this.props;
    const runId = match.params.runId || 0;

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

  render() {
    const {
      classes,
      user,
      onSignIn,
      onSignOut,
      data: { loading, error, task, dependentTasks },
      match,
    } = this.props;
    const { taskSearch, showError } = this.state;

    return (
      <Dashboard
        user={user}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        search={
          <Search
            value={taskSearch}
            onChange={this.handleTaskSearchChange}
            onSubmit={this.handleTaskSearchSubmit}
          />
        }>
        {loading && <Spinner loading />}
        {error &&
          error.graphQLErrors &&
          showError && (
            <ErrorPanel
              onClose={this.handleHideError}
              error={error.graphQLErrors[0].message}
              warning={!!task}
            />
          )}
        {task && (
          <Fragment>
            <Typography variant="headline" className={classes.title}>
              {task.metadata.name}
            </Typography>
            <Typography variant="subheading">
              <Markdown>{task.metadata.description}</Markdown>
            </Typography>
            <Chip
              className={classes.owner}
              label={
                <Fragment>
                  owned by:&nbsp;&nbsp;<em>{task.metadata.owner}</em>
                </Fragment>
              }
            />
            <Divider className={classes.divider} />
            <Grid container spacing={24}>
              <Grid item xs={12} md={6}>
                <TaskDetailsCard task={task} dependentTasks={dependentTasks} />
              </Grid>

              <Grid item xs={12} md={6}>
                <TaskRunsCard
                  selectedRunId={
                    match.params.runId
                      ? parseInt(match.params.runId, 10)
                      : task.status.runs.length - 1
                  }
                  runs={task.status.runs}
                  workerType={task.workerType}
                  provisionerId={task.provisionerId}
                  onArtifactsPageChange={this.handleArtifactsPageChange}
                />
              </Grid>
            </Grid>
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
