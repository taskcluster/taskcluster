import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { withStyles } from 'material-ui/styles';
import Dashboard from '../../../components/Dashboard';
import TaskSearch from '../../../components/TaskSearch';

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
export default class NoTask extends Component {
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

  render() {
    const { user, onSignIn, onSignOut } = this.props;
    const { taskSearch } = this.state;

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
        <span>Enter a task ID in the search box</span>
      </Dashboard>
    );
  }
}
