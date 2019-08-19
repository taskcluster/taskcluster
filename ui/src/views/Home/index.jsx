import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import Dashboard from '../../components/Dashboard';
import Homepage from '../../components/Homepage';

@hot(module)
export default class Home extends Component {
  render() {
    return (
      <Dashboard>
        <Homepage />
      </Dashboard>
    );
  }
}
