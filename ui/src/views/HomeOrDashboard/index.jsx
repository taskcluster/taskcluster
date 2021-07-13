import React, { Component } from 'react';
import { withAuth } from '../../utils/Auth';
import lazy from '../../utils/lazy';

const Home = lazy(() => import(/* webpackChunkName: 'Home' */ '../Home'));
const Dashboard = lazy(() =>
  import(/* webpackChunkName: 'Dashboard' */ '../Dashboard')
);

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
