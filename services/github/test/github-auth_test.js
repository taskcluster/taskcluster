const assert = require('assert');
const githubAuth = require('../src/github-auth');
const testing = require('taskcluster-lib-testing');

const WITH_NEWLINES = '-----BEGIN RSA PRIVATE KEY-----\nsomekey\nline2\n-----END RSA PRIVATE KEY-----';
const WITH_ESCAPED_NEWLINES = '-----BEGIN RSA PRIVATE KEY-----\\nsomekey\\nline2\\n-----END RSA PRIVATE KEY-----';

suite(testing.suiteName(), function() {
  suite('getPrivatePEM', function() {
    test('with actual newlines', function() {
      const cfg = {github: {credentials: {privatePEM: WITH_NEWLINES}}};
      assert.equal(githubAuth.getPrivatePEM(cfg), WITH_NEWLINES);
    });

    test('with escaped newlines', function() {
      const cfg = {github: {credentials: {privatePEM: WITH_ESCAPED_NEWLINES}}};
      assert.equal(githubAuth.getPrivatePEM(cfg), WITH_NEWLINES);
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
