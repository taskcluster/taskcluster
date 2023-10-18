import assert from 'assert';
import request from 'superagent';
import Debug from 'debug';

const debug = Debug('GithubClient');
const baseUrl = 'https://api.github.com';

export default class GithubClient {
  constructor({ accessToken }) {
    assert(accessToken, 'An OAuth access token is required to access Github endpoints');

    this.accessToken = accessToken;
  }

  async userFromUsername(username) {
    const { body } = await request
      .get(`${baseUrl}/users/${username}`)
      .set('Authorization', `Bearer ${this.accessToken}`)
      // user-agent is required (https://developer.github.com/v3/#user-agent-required)
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
      // user-agent is required (https://developer.github.com/v3/#user-agent-required)
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
      // user-agent is required (https://developer.github.com/v3/#user-agent-required)
      .set('user-agent', 'web-server');

    if (!body) {
      debug(`membership orgs not found`);
    }

    return body;
  }
}
