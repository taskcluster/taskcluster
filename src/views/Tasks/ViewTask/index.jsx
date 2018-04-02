import { hot } from 'react-hot-loader';
import { Component } from 'react';
import Dashboard from '../../../components/Dashboard';
import TaskSearch from '../../../components/TaskSearch';
import Query from '../../../components/Query';
import taskQuery from './task.graphql';

@hot(module)
export default class ViewTask extends Component {
  state = {
    taskSearch: this.props.match.params.taskId || '',
  };

  handleTaskSearchChange = e => {
    this.setState({ taskSearch: e.target.value || '' });
  };

  handleTaskSearchSubmit = e => {
    e.preventDefault();
    this.props.history.push(`/tasks/${this.state.taskSearch}`);
  };

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
        {taskId && (
          <Query query={taskQuery} variables={{ taskId }}>
            {({ data: { task } }) => (
              <div>
                <div>{task.metadata.name}</div>
                <div>{task.metadata.description}</div>
                <div>{task.metadata.owner}</div>
              </div>
            )}
          </Query>
        )}
        {!taskId && <span>Enter a task ID in the search box</span>}
      </Dashboard>
    );
  }
}
