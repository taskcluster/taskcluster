import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import Typography from '@material-ui/core/Typography';
import Dashboard from '../../components/Dashboard';

@hot(module)
export default class Documentation extends Component {
  render() {
    return (
      <Dashboard title="Documentation">
        <Typography variant="h4">Documentation</Typography>
      </Dashboard>
    );
  }
}
