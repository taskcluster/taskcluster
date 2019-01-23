import { hot } from 'react-hot-loader';
import React, { lazy, Component } from 'react';
import { withAuth } from '../../utils/Auth';

const Home = lazy(() => import(/* webpackChunkName: 'Home' */ '../Home'));
const Dashboard = lazy(() =>
  import(/* webpackChunkName: 'Dashboard' */ '../Dashboard')
);

@hot(module)
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
