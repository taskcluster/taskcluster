const User = require('./../user');
const Debug = require('debug');

const debug = Debug('handlers.test');

class Handler {
  constructor({name, cfg}) {
  }

  async userFromRequest(req, res) {
    let accessToken = req.headers['authorization'];
    if (!accessToken || !accessToken.startsWith('Bearer ')) {
      debug('invalid auth header');
      return;
    }
    accessToken = accessToken.split(' ')[1];
    if (accessToken == 'invalid') {
      debug('invalid token');
      return;
    }
    const user = new User();
    user.identity = 'test/' + accessToken;
    user.addRole('test:' + user.identityId);

    return user;
  }
}

module.exports = Handler;
