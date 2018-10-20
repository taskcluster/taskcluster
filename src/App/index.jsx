import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import storage from 'localforage';
import { ApolloProvider } from 'react-apollo';
import { ApolloClient } from 'apollo-client';
import { WebSocketLink } from 'apollo-link-ws';
import { getMainDefinition } from 'apollo-utilities';
import { from, split } from 'apollo-link';
import { HttpLink } from 'apollo-link-http';
import { setContext } from 'apollo-link-context';
import {
  InMemoryCache,
  IntrospectionFragmentMatcher,
} from 'apollo-cache-inmemory';
import { CachePersistor } from 'apollo-cache-persist';
import ReactGA from 'react-ga';
import { init as initSentry } from '@sentry/browser';
import { MuiThemeProvider } from '@material-ui/core/styles';
import CssBaseline from '@material-ui/core/CssBaseline';
import FontStager from '../components/FontStager';
import Main from './Main';
import { ToggleThemeContext } from '../utils/ToggleTheme';
import { AuthContext } from '../utils/Auth';
import reportError from '../utils/reportError';
import theme from '../theme';
import introspectionQueryResultData from '../fragments/fragmentTypes.json';

const AUTH_STORE = '@@TASKCLUSTER_WEB_AUTH';

@hot(module)
export default class App extends Component {
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
      split(
        // split based on operation type
        ({ query }) => {
          const { kind, operation } = getMainDefinition(query);

          return kind === 'OperationDefinition' && operation === 'subscription';
        },
        new WebSocketLink({
          uri: process.env.GRAPHQL_SUBSCRIPTION_ENDPOINT,
          options: {
            reconnect: true,
          },
        }),
        new HttpLink({
          uri: process.env.GRAPHQL_ENDPOINT,
        })
      ),
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

    if (process.env.GA_TRACKING_ID) {
      // Unique Google Analytics tracking number
      ReactGA.initialize(`UA-${process.env.GA_TRACKING_ID}`);
    }

    if (process.env.SENTRY_DSN) {
      // Data Source Name (DSN), a configuration required by the Sentry SDK
      initSentry({ dsn: process.env.SENTRY_DSN });
    }

    this.state = state;
  }

  authorize = async (user, persist = true) => {
    if (persist) {
      localStorage.setItem(AUTH_STORE, JSON.stringify(user));
    }

    this.setState({
      auth: {
        // eslint-disable-next-line react/no-access-state-in-setstate
        ...this.state.auth,
        user,
      },
    });
  };

  unauthorize = () => {
    localStorage.removeItem(AUTH_STORE);
    this.setState({
      auth: {
        // eslint-disable-next-line react/no-access-state-in-setstate
        ...this.state.auth,
        user: null,
      },
    });
  };

  toggleTheme = () => {
    this.setState({
      theme:
        this.state.theme.palette.type === 'dark'
          ? theme.lightTheme
          : theme.darkTheme,
    });
  };

  componentDidCatch(error, errorInfo) {
    this.setState({ error });

    reportError(error, errorInfo);
  }

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
