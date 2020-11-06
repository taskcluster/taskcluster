import mitt from 'mitt';
import { AUTH_STORE } from '../utils/constants';
import credentialsQuery from './credentials.graphql';
import removeKeys from '../utils/removeKeys';
import UserSession from './UserSession';

/**
 * Controller for authentication-related pieces of the site.
 *
 * This encompasses knowledge of ongoing expiration monitoring,
 * synchronizing sign-in status across tabs and any additional required UI.
 *
 * This emits a `user-changed` event with a new user each time the user
 * changes (possibly if no user information actually changed).
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

  /**
   * Get the current user, first renewing credentials if necessary.
   */
  async getUser() {
    // if no user, try loading from localStorage
    if (!this.user) {
      this.loadUser();
    }

    // if expired or no credentials, try to renew the credentials
    if (
      this.user &&
      (!this.user.credentials || new Date(this.user.expires) < new Date())
    ) {
      await this.renew();
    }

    return this.user;
  }

  /**
   * Set the current user (or if null, no user is signed in)
   *
   * This uses localStorage to communicate across browser tabs.
   */
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

  /**
   * Signal to the backend that the user is no longer
   * signed in.
   */
  async signOut() {
    await fetch('/login/logout', { method: 'POST' });
    this.setUser(null);
  }

  /* -- remaining functions are private -- */

  /**
   * Load the user from localStorage
   */
  loadUser() {
    const auth = localStorage.getItem(AUTH_STORE);

    this.user = auth ? UserSession.deserialize(auth) : null;
    this.emit('user-changed', this.user);
  }

  /**
   * Renew the current user's credentials, if applicable
   */
  async renew() {
    // if not logged in, or manually logged in, there's nothing to do
    if (!this.user || this.user.identityProviderId === 'manual') {
      return;
    }

    try {
      const { credentials, expires } = await this.fetchCredentials();

      this.setUser(
        UserSession.create({
          ...this.user,
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

  /**
   * Fetch credentials from the backend, based on the current
   * session cookie
   */
  fetchCredentials = async () => {
    const { data } = await this.client.query({
      query: credentialsQuery,
      fetchPolicy: 'no-cache',
      context: {
        // signal that this request does not need an Authorization header,
        // since it is required to generate such a header
        noAuthorizationHeader: true,
      },
    });

    return removeKeys(data.getCredentials, ['__typename']);
  };
}
