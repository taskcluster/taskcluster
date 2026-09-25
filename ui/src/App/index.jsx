import React, { Component } from 'react';
import { arrayOf } from 'prop-types';
import { ErrorBoundary } from 'react-error-boundary';
import { init as initSentry } from '@sentry/browser';
import { MuiThemeProvider } from '@material-ui/core/styles';
import CssBaseline from '@material-ui/core/CssBaseline';
import Main from './Main';
import { ToggleThemeContext } from '../utils/ToggleTheme';
import { AuthContext } from '../utils/Auth';
import { TaskclusterClientContext } from '../utils/TaskclusterClient';
import { getClient } from '../utils/client';
import db from '../utils/db';
import reportError from '../utils/reportError';
import ErrorPanel from '../components/ErrorPanel';
import theme from '../theme';
import { route } from '../utils/prop-types';
import AuthController from '../auth/AuthController';
import './index.css';

export default class App extends Component {
  static propTypes = {
    routes: arrayOf(route).isRequired,
  };

  constructor(props) {
    super(props);

    this.authController = new AuthController();
    this.authController.on('user-changed', this.handleUserChanged);

    const state = {
      error: null,
      theme: theme.darkTheme,
      auth: {
        user: null,
        getCredentials: () => this.authController.getCredentials(),
        authorize: this.authorize,
        unauthorize: this.unauthorize,
      },
    };

    if (window.env.SENTRY_DSN) {
      // Data Source Name (DSN), a configuration required by the Sentry SDK
      initSentry({
        dsn: window.env.SENTRY_DSN,
        // autoSessionTracking was removed in Sentry v8+; disable
        // session tracking by filtering out the BrowserSession integration.
        integrations: defaults =>
          defaults.filter(i => i.name !== 'BrowserSession'),
      });
    }

    this.state = state;
  }

  createTaskclusterClient = options =>
    getClient({
      ...options,
      credentialAgent: this.authController,
    });

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
    const { auth, error, theme } = this.state;

    // Note that there are two error boundaries here.  The first will catch
    // errors in the stack of providers, but presents its error panel without
    // the MUI theme, fonts, css baseline, and so on.  The second renders the
    // error with all of those things in place, but as a consequence can't
    // catch errors in those components.
    return (
      <ErrorBoundary FallbackComponent={ErrorPanel} onError={reportError}>
        <AuthContext.Provider value={auth}>
          <TaskclusterClientContext.Provider
            value={this.createTaskclusterClient}>
            <ToggleThemeContext.Provider value={this.toggleTheme}>
              <MuiThemeProvider theme={theme}>
                <CssBaseline />
                <ErrorBoundary
                  FallbackComponent={ErrorPanel}
                  onError={reportError}>
                  <Main
                    error={error}
                    key={
                      auth.user?.credentials
                        ? auth.user.credentials.clientId
                        : ''
                    }
                    routes={routes}
                  />
                </ErrorBoundary>
              </MuiThemeProvider>
            </ToggleThemeContext.Provider>
          </TaskclusterClientContext.Provider>
        </AuthContext.Provider>
      </ErrorBoundary>
    );
  }
}
