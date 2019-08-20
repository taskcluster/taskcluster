const request = require('superagent');
const Debug = require('debug');

const debug = Debug('GithubClient');
const baseUrl = 'https://api.github.com';

module.exports = class GithubClient {
  async userFromUsername(username) {
    const { body } = await request
      .get(`${baseUrl}/users/${username}`);

    if (!body) {
      debug(`profile for user ${username} not found`);
    }

    return body;
  }
};
