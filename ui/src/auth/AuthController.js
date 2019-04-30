import mitt from 'mitt';
import { snake, upper } from 'change-case';
import { AUTH_STORE } from '../utils/constants';
import credentialsQuery from './credentials.graphql';

/**
 * Controller for authentication-related pieces of the site.
 *
 * This encompasses knowledge of ongoing expiration monitoring,
 * synchronizing sign-in status across tabs and any additional required UI.
 */
export default class AuthController {
  constructor(client) {
    const events = mitt();

    this.on = events.on;
    this.off = events.off;
    this.emit = events.emit;

    this.client = client;
    this.user = null;
    this.renewalTimer = null;

    window.addEventListener('storage', ({ storageArea, key }) => {
      if (storageArea === localStorage && key === AUTH_STORE) {
        this.loadUser();
      }
    });
  }

  setUser(user) {
    if (!user) {
      localStorage.removeItem(AUTH_STORE);
    } else {
      localStorage.setItem(AUTH_STORE, JSON.stringify(user));
    }

    // localStorage updates do not trigger event listeners
    // on the current window/tab, so invoke it directly
    this.loadUser();
  }

  loadUser() {
    const auth = localStorage.getItem(AUTH_STORE);
    const user = auth ? JSON.parse(auth) : null;

    if (user) {
      const expires = new Date(user.expires);
      const now = new Date();

      if (expires < now) {
        localStorage.removeItem(AUTH_STORE);
      }
    }

    this.resetRenewalTimer(user);
    this.emit('user-changed', user);
  }

  resetRenewalTimer(user) {
    if (this.renewalTimer) {
      window.clearTimeout(this.renewalTimer);
      this.renewalTimer = null;
    }

    if (user) {
      const expires = new Date(user.expires);
      const now = new Date();
      const timeout = Math.max(0, expires.getTime() - now.getTime());

      this.renewalTimer = window.setTimeout(() => {
        this.renewalTimer = null;
        this.renew(user);
      }, timeout);
    }
  }

  async renew(user) {
    try {
      const { credentials, expires } = await this.getCredentials(user);

      this.setUser({
        ...user,
        expires,
        credentials,
      });
    } catch (e) {
      this.setUser(null);

      /* eslint-disable no-console */
      console.error('Could not renew login:', e);
    }
  }

  getCredentials = async user => {
    if (!user) {
      return null;
    }

    const provider = upper(snake(user.identityProviderId));
    const { data } = await this.client.query({
      query: credentialsQuery,
      fetchPolicy: 'no-cache',
      variables: {
        accessToken: user.accessToken,
        provider,
      },
    });

    return data.getCredentials;
  };
}
