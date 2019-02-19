import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { withAuth } from '../../utils/Auth';
import views from './views';

@hot(module)
@withAuth
export default class HomeOrDashboard extends Component {
  render() {
    const { Home, Dashboard } = views;

    return this.props.user ? (
      <Dashboard {...this.props} />
    ) : (
      <Home {...this.props} />
    );
  }
}
