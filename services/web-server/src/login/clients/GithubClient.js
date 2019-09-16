const assert = require('assert');
const request = require('superagent');
const Debug = require('debug');

const debug = Debug('GithubClient');
const baseUrl = 'https://api.github.com';

module.exports = class GithubClient {
  constructor({ accessToken }) {
    assert(accessToken, 'An access token is required to access Github endpoints');

    this.accessToken = accessToken;
  }

  async userFromUsername(username) {
    const { body } = await request
      .get(`${baseUrl}/users/${username}`)
      .set('Authorization', `Bearer ${this.accessToken}`);

    if (!body) {
      debug(`profile for user ${username} not found`);
    }

    return body;
  }

  async orgsFromUsername(username) {
    const { body } = await request
      .get(`${baseUrl}/users/${username}/orgs`)
      .set('Authorization', `Bearer ${this.accessToken}`);

    if (!body) {
      debug(`orgs for user ${username} not found`);
    }

    return body;
  }

  async reposFromOrg(org) {
    const { body } = await request
      .get(`${baseUrl}/orgs/${org}/repos`)
      .set('Authorization', `Bearer ${this.accessToken}`);

    if (!body) {
      debug(`repos for org ${org} not found`);
    }

    return body;
  }
};
