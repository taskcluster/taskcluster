import React, { Component, Fragment } from 'react';
import { BrowserRouter, Switch } from 'react-router-dom';
import { withApollo } from 'react-apollo';
import { object, arrayOf } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import RouteWithProps from '../components/RouteWithProps';
import ErrorPanel from '../components/ErrorPanel';
import StatusBanner from '../components/StatusBanner';
import Snackbar from '../components/Snackbar';
import { route } from '../utils/prop-types';
import { withAuth } from '../utils/Auth';
import isThirdPartyLogin from '../utils/isThirdPartyLogin';
import isLoggedInQuery from './isLoggedIn.graphql';

@withApollo
@withStyles(theme => ({
  '@global': {
    [[
      'input:-webkit-autofill',
      'input:-webkit-autofill:hover',
      'input:-webkit-autofill:focus',
      'input:-webkit-autofill:active',
    ].join(',')]: {
      transition:
        'background-color 5000s ease-in-out 0s, color 5000s ease-in-out 0s',
      transitionDelay: 'background-color 5000s, color 5000s',
    },
    '.mdi-icon': {
      fill: theme.palette.text.primary,
    },
    '.CodeMirror': {
      fontSize: 13,
      height: '100% !important',
    },
    '[disabled] .mdi-icon': {
      fill: theme.palette.primary.light,
    },
    a: {
      color: theme.palette.text.primary,
      textDecoration: 'inherit',
    },
    'html, body': {
      color: theme.palette.text.secondary,
    },
    pre: {
      overflowX: 'auto',
    },
    ':not(pre) > code': {
      ...theme.mixins.highlight,
    },
  },
}))
@withAuth
export default class Main extends Component {
  static propTypes = {
    error: object,
    subscriptionError: object,
    routes: arrayOf(route).isRequired,
  };

  static defaultProps = {
    error: null,
    subscriptionError: null,
  };

  state = {
    subscriptionWarningDismissed: false,
  };

  handleSubscriptionWarningClose = () => {
    this.setState({ subscriptionWarningDismissed: true });
  };

  // Called on user change because of <App key={auth.user} ... />
  async componentDidMount() {
    const { user, onUnauthorize } = this.props;
    const { data } = await this.props.client.query({
      query: isLoggedInQuery,
      fetchPolicy: 'network-only',
    });
    const thirdPartyLogin = isThirdPartyLogin();
    const isOneLoginStrategy =
      window.env.UI_LOGIN_STRATEGY_NAMES &&
      window.env.UI_LOGIN_STRATEGY_NAMES.split(' ').length === 1;
    const THIRD_PARTY_DID_AUTO_LOGIN_KEY = 'third-party-did-auto-login';

    if (
      !user &&
      thirdPartyLogin &&
      isOneLoginStrategy &&
      !sessionStorage.getItem(THIRD_PARTY_DID_AUTO_LOGIN_KEY)
    ) {
      sessionStorage.setItem(THIRD_PARTY_DID_AUTO_LOGIN_KEY, 'true');
      window.open(`/login/${window.env.UI_LOGIN_STRATEGY_NAMES}`);

      return;
    }

    if (
      user &&
      user.identityProviderId !== 'manual' &&
      data &&
      data.isLoggedIn === false
    ) {
      onUnauthorize();

      return;
    }

    // Users who were logged in earlier manually will be logged out in order to
    // be able to complete the third party login flow.
    if (user && user.identityProviderId === 'manual' && thirdPartyLogin) {
      onUnauthorize();

      return;
    }

    // If a third party tries to login but the user is
    // not logged in on the site they will be prompted to login.
    // Once logged in, we need to re-initiate the oauth2 login flow
    if (user && thirdPartyLogin) {
      window.location.href = `${window.location.origin}/login/oauth/authorize${window.location.search}`;
    }
  }

  render() {
    const { error, routes, subscriptionError } = this.props;
    const { subscriptionWarningDismissed } = this.state;

    return (
      <Fragment>
        <StatusBanner message={window.env.BANNER_MESSAGE} />
        {subscriptionError && !subscriptionWarningDismissed && (
          <Snackbar
            autoHideDuration={null}
            onClose={this.handleSubscriptionWarningClose}
            message="Live updates are not available because you are missing the web:read-pulse scope. Task information on this page may be out of date. Try signing in or refreshing the page."
            variant="warning"
            open
          />
        )}
        <ErrorPanel fixed error={error} />
        <BrowserRouter>
          <Switch>
            {routes.map(({ routes, ...props }) => (
              <RouteWithProps key={props.path || 'not-found'} {...props} />
            ))}
          </Switch>
        </BrowserRouter>
      </Fragment>
    );
  }
}
