import React, { Component } from 'react';
import Dashboard from '../../components/Dashboard';
import Homepage from '../../components/Homepage';

export default class Home extends Component {
  render() {
    return (
      <Dashboard>
        <Homepage />
      </Dashboard>
    );
  }
}
