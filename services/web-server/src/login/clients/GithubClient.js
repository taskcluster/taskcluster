const assert = require('assert');
const request = require('superagent');
const Debug = require('debug');

const debug = Debug('GithubClient');
const baseUrl = 'https://api.github.com';

module.exports = class GithubClient {
  constructor({ accessToken }) {
    assert(accessToken, 'An OAuth access token is required to access Github endpoints');

    this.accessToken = accessToken;
  }

  async userFromUsername(username) {
    const { body } = await request
      .get(`${baseUrl}/users/${username}`)
      .set('Authorization', `Bearer ${this.accessToken}`)
      .set('user-agent', 'web-server');

    if (!body) {
      debug(`profile for user ${username} not found`);
    }

    return body;
  }

  async listTeams() {
    const { body } = await request
      .get(`${baseUrl}/user/teams`)
      .set('Authorization', `Bearer ${this.accessToken}`)
      .set('user-agent', 'web-server');

    if (!body) {
      debug(`teams not found`);
    }

    return body;
  }

  async userMembershipsOrgs() {
    const { body } = await request
      .get(`${baseUrl}/user/memberships/orgs`)
      .set('Authorization', `Bearer ${this.accessToken}`)
      .set('user-agent', 'web-server');

    if (!body) {
      debug(`membership orgs not found`);
    }

    return body;
  }
};
