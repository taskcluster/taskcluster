import { hot } from 'react-hot-loader';
import React, { useState, useEffect } from 'react';
import { arrayOf } from 'prop-types';
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
  defaultDataIdFromObject,
} from 'apollo-cache-inmemory';
import { CachePersistor } from 'apollo-cache-persist';
import ReactGA from 'react-ga';
import { init as initSentry } from '@sentry/browser';
import { MuiThemeProvider } from '@material-ui/core/styles';
import CssBaseline from '@material-ui/core/CssBaseline';
import FontStager from '../components/FontStager';
// import Main from './Main';
import Main from './Main';
import { ToggleThemeContext } from '../utils/ToggleTheme';
import { AuthContext } from '../utils/Auth';
import db from '../utils/db';
// import reportError from '../utils/reportError';
import theme from '../theme';
import introspectionQueryResultData from '../fragments/fragmentTypes.json';
import { route } from '../utils/prop-types';
import AuthController from '../auth/AuthController';

const App = ({ routes }) => {
  const [error, setError] = useState(null);
  const [themeState, setThemeState] = useState(theme.darkTheme);
  const fragmentMatcher = new IntrospectionFragmentMatcher({
    introspectionQueryResultData,
  });
  const cache = new InMemoryCache({
    fragmentMatcher,
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
  const persistence = new CachePersistor({
    cache,
    storage,
  });
  const httpLink = new HttpLink({
    uri: window.env.GRAPHQL_ENDPOINT,
    credentials: 'same-origin',
  });
  const wsLink = new WebSocketLink({
    // allow configuration of https:// or http:// and translate to ws:// or wss://
    uri: window.env.GRAPHQL_SUBSCRIPTION_ENDPOINT.replace(/^http/, 'ws'),
    options: {
      reconnect: true,
      lazy: true,
    },
  });
  const apolloClient = new ApolloClient({
    cache,
    link: from([
      setContext((request, { headers }) => {
        const { user } = auth;

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
        wsLink,
        httpLink
      ),
    ]),
  });
  const handleUserChanged = user => {
    setAuth({
      ...auth,
      user,
    });
  };

  const authController = new AuthController(apolloClient);

  authController.on('user-changed', handleUserChanged);

  const authorize = async user => {
    authController.renew(user);
  };

  const unauthorize = () => {
    authController.setUser(null);
  };

  const [auth, setAuth] = useState({
    user: null,
    authorize,
    unauthorize,
  });
  const getThemeType = async () => {
    const themeType = await db.userPreferences.get('theme');

    if (themeType === 'light') {
      setThemeState(theme.lightTheme);
    }
  };

  useEffect(() => {
    if (window.env.GA_TRACKING_ID) {
      // Unique Google Analytics tracking number
      ReactGA.initialize(`UA-${window.env.GA_TRACKING_ID}`);
    }

    if (window.env.SENTRY_DSN) {
      // Data Source Name (DSN), a configuration required by the Sentry SDK
      initSentry({ dsn: window.env.SENTRY_DSN });
    }

    getThemeType();

    authController.loadUser();

    return () => {
      authController.off('user-changed', handleUserChanged);
    };
  }, []);

  const toggleTheme = () => {
    const newTheme =
      themeState && themeState.palette.type === 'dark'
        ? theme.lightTheme
        : theme.darkTheme;

    setThemeState(newTheme);
  };

  useEffect(() => {
    db.userPreferences.put(themeState.palette.type, 'theme');
  }, [themeState]);

  return (
    <ApolloProvider client={apolloClient}>
      <AuthContext.Provider value={auth}>
        <ToggleThemeContext.Provider value={toggleTheme}>
          <MuiThemeProvider theme={themeState}>
            <FontStager />
            <CssBaseline />
            <Main key={auth.user} routes={routes} error={error} />
          </MuiThemeProvider>
        </ToggleThemeContext.Provider>
      </AuthContext.Provider>
    </ApolloProvider>
  );
};

App.propTypes = {
  routes: arrayOf(route).isRequired,
};

export default hot(module)(App);
