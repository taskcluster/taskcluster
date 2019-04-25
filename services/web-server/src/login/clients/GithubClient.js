const request = require('superagent');
const Debug = require('debug');

const debug = Debug('GithubClient');
const baseUrl = 'https://api.github.com';

module.exports = class GithubClient {
  async userFromToken(accessToken) {
    const { body } = await request
      .get(`${baseUrl}/user`)
      .set('Authorization', `token ${accessToken}`);

    if (!body) {
      debug(`profile for token ${accessToken} not found`);
    }

    return body;
  }

  async userFromUsername(username) {
    const { body } = await request
      .get(`${baseUrl}/user/${username}`);

    if (!body) {
      debug(`profile for user ${username} not found`);
    }

    return body;
  }
};
