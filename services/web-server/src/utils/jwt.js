const assert = require('assert');
const jwt = require('jsonwebtoken');
const taskcluster = require('taskcluster-client');
const util = require('util');

const verify = util.promisify(jwt.verify);

// A utility to generate and verify Taskcluster jwt tokens
// with expiration taken from the sign-in process
module.exports = {
  generate: ({ rootUrl, privateKey, exp, sub, ...rest }) => {
    assert(privateKey, `jwt.generate requires a privateKey`);
    const now = taskcluster.fromNow();
    const payload = {
      // If the current time is greater than the exp, the JWT is invalid
      // https://github.com/auth0/node-jsonwebtoken#token-expiration-exp-claim
      exp,
      // If the current time is less than the nbf, the JWT is invalid
      nbf: Math.floor(now.getTime() / 1000),
      aud: rootUrl,
      iss: rootUrl,
      sub,
      ...rest,
    };
    const token = jwt.sign(payload, privateKey.trim(), { algorithm: 'RS256' });

    return {
      token,
      expires: new Date(exp * 1000),
    };
  },
  verify: ({ publicKey, token, options }) => {
    assert(publicKey, 'jwt.verify requires a privateKey');
    assert(options.issuer, 'jwt.verify requires an issuer');
    assert(options.audience, 'jwt.verify requires an audience');

    return verify(token, publicKey.trim(), {
      algorithms: ['RS256'],
      ...options
    });
  },
};
