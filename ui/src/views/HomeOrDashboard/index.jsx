import React, { Component } from 'react';
import { withAuth } from '../../utils/Auth';
import lazy from '../../utils/lazy';

const Home = lazy(() => import('../Home'));
const Dashboard = lazy(() => import('../Dashboard'));

@withAuth
export default class HomeOrDashboard extends Component {
  render() {
    return this.props.user ? (
      <Dashboard {...this.props} />
    ) : (
      <Home {...this.props} />
    );
  }
}
