const request = require('superagent');
const Debug = require('debug');

const debug = Debug('GithubClient');
const baseUrl = 'https://api.github.com';

module.exports = class GithubClient {
  constructor({ clientId, clientSecret }) {
    this._clientId = clientId;
    this._clientSecret = clientSecret;
  }

  async userFromUsername(username) {
    const { body } = await request
      .get(`${baseUrl}/users/${username}`);

    if (!body) {
      debug(`profile for user ${username} not found`);
    }

    return body;
  }

  async checkAuthorization(accessToken) {
    const encodedAuthorization = new Buffer.from(`${this._clientId}:${this._clientSecret}`).toString('base64');

    const { body } = await request
      .get(`${baseUrl}/applications/${this._clientId}/tokens/${accessToken}`)
      .set('Authorization', `Basic ${encodedAuthorization}`);

    return body;
  }
};
