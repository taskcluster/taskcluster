import Mutex from 'fast-mutex';
import fetch from '../fetch';

const MUTEX_LOCK_KEY = '@@TASKCLUSTER_CLIENT_WEB_CREDENTIALS';

/**
 * A credential agent that fetches the credentials from the taskcluster
 * login service, given an access_token.
 *
 * Users can keep a single such credential agent and use it simultaneously
 * with many Client instances.
 */
export default class OIDCCredentialAgent {
  constructor({ accessToken, oidcProvider }) {
    this._accessToken = accessToken;
    this.oidcProvider = oidcProvider;
  }

  // Update the access token, invalidating any cached credentials
  set accessToken(accessToken) {
    this._accessToken = accessToken;
    this.credentialsPromise = null;
  }

  get accessToken() {
    return this._accessToken;
  }

  async getCredentials() {
    // If we already have a credentials promise, check to see if they have expired.
    // If not, we can just return the credentials we have cached in the promise.
    if (this.credentialsPromise && this.credentialsExpire > new Date()) {
      return this.credentialsPromise;
    }

    // Call the oidcCredentials endpoint with the access token.
    const loginBaseUrl = 'https://login.taskcluster.net';
    const url = `${loginBaseUrl}/v1/oidc-credentials/${this.oidcProvider}`;
    const mutex = new Mutex();

    // Lock access to this value across tabs so only 1 leader instance does
    // a fetch for credentials. This await will resolve for the leader first
    // so it can set the session value. The peers will resolve once the leader
    // unlocks the mutex, and can access the session set by the leader. This
    // mutex will unlock in 5 seconds if it has not been resolved by the leader
    // in that time.
    await mutex.lock(MUTEX_LOCK_KEY);

    // The existence of the session in localStorage drives whether we are the
    // mutex leader or just a peer. The leader, being unlocked first, will have
    // an empty session, and is therefore responsible for setting the session.
    // The peers will unlock once the leader has released its lock, and can
    // access this session value.
    const session = localStorage.getItem(MUTEX_LOCK_KEY);

    if (session) {
      // If the session exists, it was set by the leader mutex. Grab the
      // credentials from storage and pass them on.
      const response = JSON.parse(session);

      this.credentialsExpire = new Date(response.expires);
      this.credentialsPromise = Promise.resolve(response.credentials);
      await mutex.release(MUTEX_LOCK_KEY);
    } else {
      // With nothing in localStorage, we are the leader mutex, and will
      // be logging in for all other sessions. Fetch the remote credentials.
      this.credentialsPromise = new Promise(async (resolve, reject) => {
        try {
          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${this.accessToken}`
            }
          });

          this.credentialsExpire = new Date(response.expires);

          // Since we are the mutex leader, it's our job to set the value in
          // localStorage for the peers to access.
          localStorage.setItem(MUTEX_LOCK_KEY, JSON.stringify(response));

          setTimeout(() => {
            // We remove the session from storage in 30 seconds as it is not
            // the responsibility of this library to perform persistence. Rather,
            // localStorage is merely the means of enabling cross-tab communication
            // and we want to leave the session in the same state we found it. It
            // is still up to the agent consumer to persist these credentials
            // however they decide. We also want to ensure that whenever the current
            // credentials have expired that we don't run into a situation where we
            // resolve with stale credentials, so we let the credentialsPromise and
            // credentialsExpire drive this and avoid localStorage somehow interfering.
            localStorage.removeItem(MUTEX_LOCK_KEY);
          }, 30000);

          // We are done fetching the credentials and setting the value for peers to
          // access. Release our lock and let them pull the value from storage.
          await mutex.release(MUTEX_LOCK_KEY);

          // As the leader we still need to give the caller access to the credentials.
          resolve(response.credentials);
        } catch (err) {
          // Something went wrong with the request, so our promise is not valid.
          // We still need to unblock our peers to make their own requests as a
          // backup.
          this.credentialsPromise = null;
          await mutex.release(MUTEX_LOCK_KEY);
          reject(err);
        }
      });
    }

    // We return this promise so credentials access is cached until expiration.
    return this.credentialsPromise;
  }
}
