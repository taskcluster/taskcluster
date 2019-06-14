const assert = require('assert');
const testing = require('taskcluster-lib-testing');
const taskcluster = require('taskcluster-client');
const jwt = require('../src/utils/jwt');

suite(testing.suiteName(), () => {
  const rootUrl = 'https://test.taskcluster.net';
  // DO NOT USE THIS KEY IN PRODUCTION
  const key = 'MFswDQYJKoZIhvcNAQEBBQADSgAwRwJActU6+fTN5QIeCPqlyzIFd9zH9FIRG4u8';

  test('should be able to generate a token with a valid expiration', () => {
    const identity = 'mozilla-auth0/ad|Mozilla-LDAP|haali/';
    const exp = Math.floor(taskcluster.fromNow('2 days').getTime() / 1000);
    const { token, expires } = jwt.generate({ aud: rootUrl, iss: rootUrl, key, sub: identity, exp });

    assert(token.indexOf('.') !== -1, 'should have created a token, with a `.` separator');
    assert.equal(expires.getTime() / 1000, exp, 'should of had a valid expiration');
  });

  test('should be able to verify a token', async () => {
    const identity = 'mozilla-auth0/ad|Mozilla-LDAP|haali/';
    const exp = Math.floor(taskcluster.fromNow('2 days').getTime() / 1000);
    const { expires, token } = jwt.generate({ aud: rootUrl, iss: rootUrl, sub: identity, key, exp });
    const options = { audience: rootUrl, issuer: rootUrl, subject: identity };
    const decoded = await jwt.verify({
      key,
      token,
      options,
    });

    assert.equal(decoded.sub, identity, 'should of had a valid sub property');
    assert.equal(decoded.iss, rootUrl, 'should of had a valid iss property');
    assert.equal(decoded.aud, rootUrl, 'should of had a valid aud property');
    // exp returns a value in seconds; Date.now returns a value in milliseconds
    // https://github.com/auth0/node-jsonwebtoken#token-expiration-exp-claim
    assert(decoded.exp * 1000 > Date.now(), 'should of had an expiration in the future');
    assert.equal(expires.getTime(), decoded.exp * 1000, 'should of had  valid expires value');
  });

  test('should throw when verifying with the wrong publicKey', async () => {
    const identity = 'mozilla-auth0/ad|Mozilla-LDAP|haali/';
    const exp = Math.floor(taskcluster.fromNow('2 days').getTime() / 1000);
    const { token } = jwt.generate({ aud: rootUrl, iss: rootUrl, sub: identity, key, exp });
    const options = { audience: rootUrl, issuer: rootUrl, subject: identity };

    let f = () => {};

    try {
      await jwt.verify({ key: 'test', token, options });
    } catch(e) {
      f = () => { throw e; };
    } finally {
      assert.throws(f, /^JsonWebTokenError: invalid/);
    }
  });

  test('should throw when verifying with the wrong audience', async () => {
    const identity = 'mozilla-auth0/ad|Mozilla-LDAP|haali/';
    const exp = Math.floor(taskcluster.fromNow('2 days').getTime() / 1000);
    const { token } = jwt.generate({ aud: rootUrl, iss: rootUrl, sub: identity, key, exp });
    const options = { audience: 'hassan', issuer: rootUrl, subject: identity };
    let f = () => {};

    try {
      await jwt.verify({ key, token, options });
    } catch(e) {
      f = () => { throw e; };
    } finally {
      assert.throws(f, /^JsonWebTokenError: jwt audience invalid/);
    }
  });

  test('should throw when verifying with an expired token', async () => {
    const identity = 'mozilla-auth0/ad|Mozilla-LDAP|haali/';
    const exp = Math.floor(taskcluster.fromNow('-2 days').getTime() / 1000);
    const { token } = jwt.generate({ aud: rootUrl, iss: rootUrl, sub: identity, key, exp });
    const options = { audience: rootUrl, issuer: rootUrl, subject: identity };

    let f = () => {};

    try {
      await jwt.verify({ key, token, options });
    } catch(e) {
      f = () => { throw e; };
    } finally {
      assert.throws(f, /^TokenExpiredError: jwt expired/);
    }
  });

  test('should throw when verifying with the wrong subject', async () => {
    const identity = 'mozilla-auth0/ad|Mozilla-LDAP|haali/';
    const exp = Math.floor(taskcluster.fromNow('2 days').getTime() / 1000);
    const { token } = jwt.generate({ aud: rootUrl, iss: rootUrl, sub: identity, key, exp });
    const options = { audience: rootUrl, issuer: rootUrl, subject: 'hassan' };

    let f = () => {};

    try {
      await jwt.verify({ key, token, options });
    } catch(e) {
      f = () => { throw e; };
    } finally {
      assert.throws(f, /^JsonWebTokenError: jwt subject invalid/);
    }
  });

  test('should throw when verifying with current time before the nbf claim', async () => {
    const identity = 'mozilla-auth0/ad|Mozilla-LDAP|haali/';
    const exp = Math.floor(taskcluster.fromNow('2 days').getTime() / 1000);
    const nbf = Math.floor(taskcluster.fromNow('1 min').getTime() / 1000);
    const { token } = jwt.generate({ aud: rootUrl, iss: rootUrl, sub: identity, key, exp, nbf });
    const options = { audience: rootUrl, issuer: rootUrl, subject: identity };

    let f = () => {};

    try {
      await jwt.verify({ key, token, options });
    } catch(e) {
      f = () => { throw e; };
    } finally {
      assert.throws(f, /^NotBeforeError: jwt not active/);
    }
  });
});
