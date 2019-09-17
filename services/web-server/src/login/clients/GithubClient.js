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

  // List organizations of the current user which have allowed our GitHub application to access authorized scopes.
  async listOrgs() {
    const { body } = await request
      .get(`${baseUrl}/user/orgs`)
      .set('Authorization', `Bearer ${this.accessToken}`);

    if (!body) {
      debug(`orgs for logged in user not found`);
    }

    return body;
  }

  async readPermissionLevel(org, repo, username) {
    const { body } = await request
      .get(`${baseUrl}/repos/${org}/${repo}/collaborators/${username}/permission`)
      .set('Authorization', `Bearer ${this.accessToken}`);

    if (!body) {
      debug(`permission level for ${username} in ${org}/${repo} not found`);
    }

    return body;
  }

  async reposFromOrg(org) {
    const { body } = await request
      .get(`${baseUrl}/orgs/${org}/repos`)
      .set('Authorization', `token ${this.accessToken}`);

    if (!body) {
      debug(`repos for org ${org} not found`);
    }

    return body;
  }
};
