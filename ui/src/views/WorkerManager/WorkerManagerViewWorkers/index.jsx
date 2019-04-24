import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import Dashboard from '../../../components/Dashboard';

@hot(module)
export default class WorkerManagerViewWorkers extends Component {
  render() {
    return <Dashboard title="Workers View" />;
  }
}
