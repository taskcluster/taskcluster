import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';

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
    const { taskSearch } = this.state;

    // TODO: If there isn't a selected task, fill with recent task cards
    return (
      <Dashboard
        search={
          <Search
            value={taskSearch}
            onChange={this.handleTaskSearchChange}
            onSubmit={this.handleTaskSearchSubmit}
          />
        }>
        <Typography>Enter a task ID in the search box</Typography>
      </Dashboard>
    );
  }
}
