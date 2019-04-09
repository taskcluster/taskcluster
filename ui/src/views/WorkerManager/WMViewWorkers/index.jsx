import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import Dashboard from '../../../components/Dashboard';

@hot(module)
export default class WorkerManager extends Component {
  render() {
    return <Dashboard title="Worker Type View" />;
  }
}
