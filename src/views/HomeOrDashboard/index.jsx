import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { withAuth } from '../../utils/Auth';
import loadable from '../../utils/loadable';

const Home = loadable(() => import(/* webpackChunkName: 'Home' */ '../Home'));
const Dashboard = loadable(() =>
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
