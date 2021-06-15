import React, { Component } from 'react';
import Dashboard from '../../components/Dashboard';
import NotFoundComponent from '../../components/NotFound';

export default class NotFound extends Component {
  render() {
    return (
      <Dashboard>
        <NotFoundComponent />
      </Dashboard>
    );
  }
}
