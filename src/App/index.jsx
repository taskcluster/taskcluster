import { hot } from 'react-hot-loader';
import { Component } from 'react';
import storage from 'localforage';
import { ApolloProvider } from 'react-apollo';
import { ApolloClient } from 'apollo-client';
import { from } from 'apollo-link';
import { HttpLink } from 'apollo-link-http';
import { setContext } from 'apollo-link-context';
import {
  InMemoryCache,
  IntrospectionFragmentMatcher,
} from 'apollo-cache-inmemory';
import { CachePersistor } from 'apollo-cache-persist';
import { MuiThemeProvider } from '@material-ui/core/styles';
import CssBaseline from '@material-ui/core/CssBaseline';
import FontStager from '../components/FontStager';
import Main from './Main';
import { ToggleThemeContext } from '../utils/ToggleTheme';
import { AuthContext } from '../utils/Auth';
import theme from '../theme';
import introspectionQueryResultData from '../fragments/fragmentTypes.json';

const AUTH_STORE = '@@TASKCLUSTER_WEB_AUTH';

@hot(module)
export default class App extends Component {
  authorize = async (user, persist = true) => {
    if (persist) {
      localStorage.setItem(AUTH_STORE, JSON.stringify(user));
    }

    this.setState({
      auth: {
        ...this.state.auth,
        user,
      },
    });
  };

  unauthorize = () => {
    localStorage.removeItem(AUTH_STORE);
    this.setState({
      auth: {
        ...this.state.auth,
        user: null,
      },
    });
  };

  fragmentMatcher = new IntrospectionFragmentMatcher({
    introspectionQueryResultData,
  });
  cache = new InMemoryCache({ fragmentMatcher: this.fragmentMatcher });
  persistence = new CachePersistor({
    cache: this.cache,
    storage,
  });
  apolloClient = new ApolloClient({
    cache: this.cache,
    link: from([
      setContext((request, { headers }) => {
        const { user } = this.state.auth;

        if (!user || !user.credentials) {
          return;
        }

        return {
          headers: {
            ...headers,
            Authorization: `Bearer ${btoa(JSON.stringify(user.credentials))}`,
          },
        };
      }),
      new HttpLink(),
    ]),
  });

  constructor(props) {
    super(props);
    const state = {
      error: null,
      theme: theme.darkTheme,
      auth: {
        user: null,
        authorize: this.authorize,
        unauthorize: this.unauthorize,
      },
    };
    const auth = localStorage.getItem(AUTH_STORE);

    if (auth) {
      const user = JSON.parse(auth);
      const expires = new Date(user.expires);
      const now = new Date();

      if (expires > now) {
        Object.assign(state.auth, { user });
        setTimeout(this.unauthorize, expires.getTime() - now.getTime());
      } else {
        localStorage.removeItem(AUTH_STORE);
      }
    }

    this.state = state;
  }

  componentDidCatch(error) {
    this.setState({ error });
  }

  toggleTheme = () => {
    this.setState({
      theme:
        this.state.theme.palette.type === 'dark'
          ? theme.lightTheme
          : theme.darkTheme,
    });
  };

  render() {
    const { auth, error, theme } = this.state;

    return (
      <ApolloProvider client={this.apolloClient}>
        <AuthContext.Provider value={auth}>
          <ToggleThemeContext.Provider value={this.toggleTheme}>
            <MuiThemeProvider theme={theme}>
              <FontStager />
              <CssBaseline />
              <Main error={error} />
            </MuiThemeProvider>
          </ToggleThemeContext.Provider>
        </AuthContext.Provider>
      </ApolloProvider>
    );
  }
}
