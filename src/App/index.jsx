import { BrowserRouter, Switch, withRouter, Route } from 'react-router-dom';
import Loadable from 'react-loadable';
import { MuiThemeProvider } from 'material-ui/styles';
import Reboot from 'material-ui/Reboot';
import PermanentDrawer from '../components/PermanentDrawer';
import Spinner from '../components/Spinner';
import PropsRoute from '../components/PropsRoute';
import NotFound from '../components/NotFound';
import theme from './theme';

const loadable = loader =>
  Loadable({
    loading: Spinner,
    loader
  });
const Home = loadable(() =>
  import(/* webpackChunkName: 'Home' */ '../views/Home')
);
const Documentation = loadable(() =>
  import(/* webpackChunkName: 'TaskCreator' */ '../views/Documentation')
);
const App = () => {
  const Layout = withRouter(props => (
    <div>
      <Reboot />
      <MuiThemeProvider theme={theme}>
        <PermanentDrawer>
          <h1>Welcome</h1>
          <Switch>
            <PropsRoute path="/docs" component={Documentation} {...props} />
            <PropsRoute exact path="/" component={Home} {...props} />
            <Route component={NotFound} />
          </Switch>
        </PermanentDrawer>
      </MuiThemeProvider>
    </div>
  ));

  return (
    <div>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </div>
  );
};

export default App;
