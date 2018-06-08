import fetch from '../fetch';

/**
 * A credential agent that fetches the credentials from the taskcluster
 * login service, given an access_token.
 *
 * Users can keep a single such credential agent and use it simultaneously
 * with many Client instances.
 */
export default class OIDCCredentialAgent {
  constructor({ accessToken, url }) {
    if (!this.url) {
      throw new Error('Missing required option "url"');
    }

    this._accessToken = accessToken;
    this.url = url;
  }

  // Update the access token, invalidating any cached credentials
  set accessToken(accessToken) {
    this._accessToken = accessToken;
    this.credentialsPromise = null;
  }

  get accessToken() {
    return this._accessToken;
  }

  getCredentials() {
    if (this.credentialsPromise && this.credentialsExpire > new Date()) {
      return this.credentialsPromise;
    }

    this.credentialsPromise = fetch(this.url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    })
      .then(response => {
        this.credentialsExpire = new Date(response.expires);

        return response.credentials;
      })
      .catch(err => {
        this.credentialsPromise = null;
        throw err;
      });

    return this.credentialsPromise;
  }
}
