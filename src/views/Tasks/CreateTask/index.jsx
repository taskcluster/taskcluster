import { hot } from 'react-hot-loader';
import { Component } from 'react';
import Typography from '@material-ui/core/Typography';
import Dashboard from '../../../components/Dashboard';

@hot(module)
export default class CreateTask extends Component {
  render() {
    return (
      <Dashboard>
        <Typography variant="display1">Create task</Typography>
      </Dashboard>
    );
  }
}
