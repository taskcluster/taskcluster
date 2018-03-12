import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { BrowserRouter, Switch, Route } from 'react-router-dom';
import { MuiThemeProvider } from 'material-ui/styles';
import CssBaseline from 'material-ui/CssBaseline';
import RouteWithProps from '../components/RouteWithProps';
import FontStager from '../components/FontStager';
import ErrorPanel from '../components/ErrorPanel';
import loadable from '../utils/loadable';
import theme from '../theme';
import './globals.css';

const Home = loadable(() =>
  import(/* webpackChunkName: 'Home' */ '../views/Home')
);
const Documentation = loadable(() =>
  import(/* webpackChunkName: 'Documentation' */ '../views/Documentation')
);
const NotFound = loadable(() =>
  import(/* webpackChunkName: 'NotFound' */ '../views/NotFound')
);

@hot(module)
export default class App extends Component {
  state = {
    error: null
  };

  componentDidCatch(error) {
    this.setState({ error });
  }

  render() {
    const { error } = this.state;

    return (
      <MuiThemeProvider theme={theme}>
        <FontStager />
        <CssBaseline />
        {error && <ErrorPanel error={error} />}
        <BrowserRouter>
          <Switch>
            <RouteWithProps path="/docs" component={Documentation} />
            <RouteWithProps exact path="/" component={Home} />
            <Route component={NotFound} />
          </Switch>
        </BrowserRouter>
      </MuiThemeProvider>
    );
  }
}
