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

  async listTeams(org) {
    const { body } = await request
      .get(`${baseUrl}/user/teams`)
      .set('Authorization', `token ${this.accessToken}`);

    if (!body) {
      debug(`repos for org ${org} not found`);
    }

    return body;
  }

  async userMembershipsOrgs() {
    const { body } = await request
      .get(`${baseUrl}/user/memberships/orgs`)
      .set('Authorization', `token ${this.accessToken}`);

    if (!body) {
      debug(`membership orgs not found`);
    }

    return body;
  }
};
