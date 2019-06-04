import mitt from 'mitt';
import { snake, upper } from 'change-case';
import { MAX_SET_TIMEOUT_DELAY, AUTH_STORE } from '../utils/constants';
import credentialsQuery from './credentials.graphql';
import removeKeys from '../utils/removeKeys';
import UserSession from './UserSession';

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
    let user = auth ? UserSession.deserialize(auth) : null;

    if (user) {
      const now = new Date();
      // Logout the user if the provider's access token has expired.
      const expires = new Date(user.providerExpires);

      if (expires < now) {
        localStorage.removeItem(AUTH_STORE);
        user = null;
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
      const taskclusterExpires = new Date(user.expires);
      const now = new Date();
      let timeout = Math.max(0, taskclusterExpires.getTime() - now.getTime());

      // if the timeout is in the future, apply up to a few minutes to it
      // randomly.  This avoids multiple tabs all trying to renew at the
      // same time.
      if (timeout > 0) {
        timeout = Math.max(0, timeout - Math.random() * 5 * 60 * 1000);
      }

      this.renewalTimer = window.setTimeout(() => {
        this.renewalTimer = null;
        this.renew(user);
      }, Math.min(timeout, MAX_SET_TIMEOUT_DELAY));
    }
  }

  async renew(user) {
    try {
      const { credentials, expires } =
        user.identityProviderId === 'manual'
          ? user
          : await this.getCredentials(user);

      this.setUser(
        UserSession.create({
          ...user,
          expires,
          credentials,
        })
      );
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

    return removeKeys(data.getCredentials, ['__typename']);
  };
}
