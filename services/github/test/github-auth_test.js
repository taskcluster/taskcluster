const assert = require('assert');
const githubAuth = require('../src/github-auth');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  suite('getPrivatePEM', function() {
    const privatePEM = '-----BEGIN RSA PRIVATE KEY-----\nsomekey\n-----END RSA PRIVATE KEY-----';

    test('with actual newlines', function() {
      const cfg = {github: {credentials: {privatePEM}}};
      assert.equal(githubAuth.getPrivatePEM(cfg), privatePEM);
    });

    test('with escaped newlines', function() {
      const cfg = {github: {credentials: {privatePEM: privatePEM.replace('\n', '\\n')}}};
      assert.equal(githubAuth.getPrivatePEM(cfg), privatePEM);
    });

    test('with invalid value', function() {
      const cfg = {github: {credentials: {privatePEM: 'somekey'}}};
      assert.throws(() => githubAuth.getPrivatePEM(cfg), err => {
        assert(/must match/.test(err.toString()));
        assert(!/somekey/.test(err.toString()));
        return true;
      });
    });
  });
});
