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
import { ErrorBoundary } from 'react-error-boundary';
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
import Main from './Main';
import { ToggleThemeContext } from '../utils/ToggleTheme';
import { AuthContext } from '../utils/Auth';
import db from '../utils/db';
import reportError from '../utils/reportError';
import ErrorPanel from '../components/ErrorPanel';
import theme from '../theme';
import introspectionQueryResultData from '../fragments/fragmentTypes.json';
import { route } from '../utils/prop-types';
import AuthController from '../auth/AuthController';
import './index.css';

const absoluteUrl = (url, overrides = {}) =>
  Object.assign(new URL(url, window.location), overrides).toString();

export default class App extends Component {
  static propTypes = {
    routes: arrayOf(route).isRequired,
  };

  /**
   * This is deprecated in apollo client v3
   * https://www.apollographql.com/docs/react/migrating/apollo-client-3-migration/#breaking-cache-changes
   * After upgrade InMemoryCache would have { possibleTypes } option
   * which will accept fragmentTypes.json contents directly
   */
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
      connectionCallback: error => {
        if (error?.message?.includes('InsufficientScopes')) {
          this.setState({ subscriptionError: error });
          // close without reconnect
          // note: immediate is used to ensure error is propagated
          // to the subscriber before channel is closed
          setImmediate(() => this.wsLink.subscriptionClient.close());
        }
      },
      connectionParams: async () => {
        const user = await this.authController.getUser();

        if (user && user.credentials) {
          return {
            Authorization: `Bearer ${btoa(JSON.stringify(user.credentials))}`,
          };
        }
      },
    },
  });

  /**
   * Add an Authorization header to every request, unless
   * context.noAuthorizationHeader; the latter can be set on
   * a request as an argument to `client.query({..})`.
   */
  authLink = setContext(async (request, { noAuthorizationHeader, headers }) => {
    if (noAuthorizationHeader) {
      return {};
    }

    const user = await this.authController.getUser();

    if (!user || !user.credentials) {
      return {};
    }

    return {
      headers: {
        ...headers,
        Authorization: `Bearer ${btoa(JSON.stringify(user.credentials))}`,
      },
    };
  });

  apolloClient = new ApolloClient({
    cache: this.cache,
    link: from([
      this.authLink,
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
      subscriptionError: null,
    };

    if (window.env.GA_TRACKING_ID) {
      // Unique Google Analytics tracking number
      ReactGA.initialize(`UA-${window.env.GA_TRACKING_ID}`);
    }

    if (window.env.SENTRY_DSN) {
      // Data Source Name (DSN), a configuration required by the Sentry SDK
      initSentry({
        dsn: window.env.SENTRY_DSN,
        autoSessionTracking: false,
      });
    }

    this.state = state;
  }

  handleUserChanged = user => {
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

    if (themeType === 'light') {
      this.setState({ theme: theme.lightTheme });
    }

    const user = await this.authController.getUser();

    this.setState({
      auth: {
        ...this.state.auth,
        user,
      },
    });
  }

  authorize = user => this.authController.setUser(user);

  unauthorize = () => {
    this.authController.signOut().catch(error => this.setState({ error }));
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

  render() {
    const { routes } = this.props;
    const { auth, error, theme, subscriptionError } = this.state;

    // Note that there are two error boundaries here.  The first will catch
    // errors in the stack of providers, but presents its error panel without
    // the MUI theme, fonts, css baseline, and so on.  The second renders the
    // error with all of those things in place, but as a consequence can't
    // catch errors in those components.
    return (
      <ErrorBoundary FallbackComponent={ErrorPanel} onError={reportError}>
        <ApolloProvider client={this.apolloClient}>
          <AuthContext.Provider value={auth}>
            <ToggleThemeContext.Provider value={this.toggleTheme}>
              <MuiThemeProvider theme={theme}>
                <CssBaseline />
                <ErrorBoundary
                  FallbackComponent={ErrorPanel}
                  onError={reportError}>
                  <Main
                    error={error}
                    subscriptionError={subscriptionError}
                    key={
                      auth.user && auth.user.credentials
                        ? auth.user.credentials.clientId
                        : ''
                    }
                    routes={routes}
                  />
                </ErrorBoundary>
              </MuiThemeProvider>
            </ToggleThemeContext.Provider>
          </AuthContext.Provider>
        </ApolloProvider>
      </ErrorBoundary>
    );
  }
}
