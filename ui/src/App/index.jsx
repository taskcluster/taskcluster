import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { arrayOf } from 'prop-types';
import storage from 'localforage';
import { ApolloProvider } from 'react-apollo';
import { ApolloClient } from 'apollo-client';
import { WebSocketLink } from 'apollo-link-ws';
import { getMainDefinition } from 'apollo-utilities';
import { from, split } from 'apollo-link';
import { createHttpLink } from 'apollo-link-http';
import { setContext } from 'apollo-link-context';
import {
  InMemoryCache,
  IntrospectionFragmentMatcher,
  defaultDataIdFromObject,
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
import db from '../utils/db';
import reportError from '../utils/reportError';
import theme from '../theme';
import introspectionQueryResultData from '../fragments/fragmentTypes.json';
import { route } from '../utils/prop-types';
import AuthController from '../auth/AuthController';

const absoluteUrl = (url, overrides = {}) =>
  Object.assign(new URL(url, window.location), overrides).toString();

@hot(module)
export default class App extends Component {
  static propTypes = {
    routes: arrayOf(route).isRequired,
  };

  fragmentMatcher = new IntrospectionFragmentMatcher({
    introspectionQueryResultData,
  });

  cache = new InMemoryCache({
    fragmentMatcher: this.fragmentMatcher,
    /* eslint-disable no-underscore-dangle */
    dataIdFromObject: object => {
      switch (object.__typename) {
        case 'TaskStatus': {
          const taskId = object.taskId || null;

          return taskId
            ? `${object.taskId}-${object.__typename}`
            : defaultDataIdFromObject(object);
        }

        default: {
          // fall back to default handling
          return defaultDataIdFromObject(object);
        }
      }
    },
    /* eslint-enable no-underscore-dangle */
  });

  persistence = new CachePersistor({
    cache: this.cache,
    storage,
  });

  httpLink = createHttpLink({
    uri: absoluteUrl(window.env.GRAPHQL_ENDPOINT),
    credentials: 'same-origin',
  });

  wsLink = new WebSocketLink({
    uri: absoluteUrl(window.env.GRAPHQL_SUBSCRIPTION_ENDPOINT, {
      // allow configuration of https:// or http:// and translate to ws:// or wss://
      protocol: window.location.protocol === 'https:' ? 'wss:' : 'ws:',
    }),
    options: {
      reconnect: true,
      lazy: true,
    },
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
        this.wsLink,
        this.httpLink
      ),
    ]),
  });

  constructor(props) {
    super(props);

    this.authController = new AuthController(this.apolloClient);
    this.authController.on('user-changed', this.handleUserChanged);

    const state = {
      error: null,
      theme: theme.darkTheme,
      auth: {
        user: null,
        authorize: this.authorize,
        unauthorize: this.unauthorize,
      },
    };

    if (window.env.GA_TRACKING_ID) {
      // Unique Google Analytics tracking number
      ReactGA.initialize(`UA-${window.env.GA_TRACKING_ID}`);
    }

    if (window.env.SENTRY_DSN) {
      // Data Source Name (DSN), a configuration required by the Sentry SDK
      initSentry({ dsn: window.env.SENTRY_DSN });
    }

    this.state = state;
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  handleUserChanged = user => {
    if (!user) {
      this.authController.clearSession();
    }

    this.setState({
      auth: {
        ...this.state.auth,
        user,
      },
    });
  };

  componentWillUnmount() {
    this.authController.off('user-changed', this.handleUserChanged);
  }

  async componentDidMount() {
    const themeType = await db.userPreferences.get('theme');

    this.authController.loadUser();

    if (themeType === 'light') {
      this.setState({ theme: theme.lightTheme });
    }
  }

  authorize = user => this.authController.renew(user);

  unauthorize = () => {
    this.authController.setUser(null);
  };

  toggleTheme = () => {
    this.setState({
      theme:
        this.state.theme.palette.type === 'dark'
          ? theme.lightTheme
          : theme.darkTheme,
    });
    const newTheme =
      this.state.theme && this.state.theme.palette.type === 'dark'
        ? theme.lightTheme
        : theme.darkTheme;

    db.userPreferences.put(newTheme.palette.type, 'theme');
    this.setState({ theme: newTheme });
  };

  componentDidCatch(error, errorInfo) {
    reportError(error, errorInfo);
  }

  render() {
    const { routes } = this.props;
    const { auth, error, theme } = this.state;

    return (
      <ApolloProvider client={this.apolloClient}>
        <AuthContext.Provider value={auth}>
          <ToggleThemeContext.Provider value={this.toggleTheme}>
            <MuiThemeProvider theme={theme}>
              <FontStager />
              <CssBaseline />
              <Main
                key={
                  auth.user && auth.user.credentials
                    ? auth.user.credentials.clientId
                    : ''
                }
                routes={routes}
                error={error}
              />
            </MuiThemeProvider>
          </ToggleThemeContext.Provider>
        </AuthContext.Provider>
      </ApolloProvider>
    );
  }
}
