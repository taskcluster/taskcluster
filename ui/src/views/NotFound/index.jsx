import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import Dashboard from '../../components/Dashboard';
import NotFoundComponent from '../../components/NotFound';

@hot(module)
export default class NotFound extends Component {
  render() {
    return (
      <Dashboard>
        <NotFoundComponent />
      </Dashboard>
    );
  }
}
