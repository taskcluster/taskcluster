const assert = require('assert');
const Debug = require('debug');
const User = require('../User');
const encode = require('../../utils/encode');
const { CLIENT_ID_PATTERN } = require('../../utils/constants');

const debug = Debug('handlers.github-oauth2');

class Handler {
  constructor({ name, cfg }) {
    const handlerCfg = cfg.login.handlers[name];

    assert(handlerCfg.clientId, `${name}.clientId is required`);
    assert(handlerCfg.clientSecret, `${name}.clientSecret is required`);

    Object.assign(this, handlerCfg);
    this.identityProviderId = 'github-oauth2';
  }

  async getUser({ userId }) {
    const user = new User();

    user.identity = `${this.identityProviderId}/${encode(userId)}`;

    if (!user.identity) {
      debug('No recognized identity providers');
      return;
    }

    // take a user and attach roles to it
    // this.addRoles(userProfile, user);

    return user;
  }

  // exposed method
  userFromClientId(clientId) {
    const patternMatch = CLIENT_ID_PATTERN.exec(clientId);
    const identity = patternMatch && patternMatch[1];

    if (!identity) {
      return;
    }

    // TODO: return a user
    return;
  }
}

module.exports = Handler;
