import { hot } from 'react-hot-loader';
import { Component } from 'react';
import Typography from '@material-ui/core/Typography';
import Dashboard from '../../components/Dashboard';

@hot(module)
export default class Documentation extends Component {
  render() {
    return (
      <Dashboard title="Documentation">
        <Typography variant="display1">Documentation</Typography>
      </Dashboard>
    );
  }
}
