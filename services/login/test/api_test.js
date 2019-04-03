const libUrls = require('taskcluster-lib-urls');
const assume = require('assume');
const helper = require('./helper');
const request = require('superagent');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.setup();

  suite('credentialsFromAccessToken', function() {
    test('returns 400 for a call without a header', async function() {
      try {
        await helper.login.oidcCredentials('test');
      } catch (e) {
        assume(e.statusCode).to.equal(400);
        assume(e.code).to.equal('InputError');
        return;
      }
      throw new Error('should have failed');
    });

    test('returns credentials for "test" provider', async function() {
      let res = await request
        .get(libUrls.api(helper.rootUrl, 'login', 'v1', '/oidc-credentials/test'))
        .set('Authorization', 'Bearer let-me-in');
      let resp = JSON.parse(res.text);
      assume(resp.credentials.clientId).to.equal('test/let-me-in');
      let until_exp = new Date(resp.expires) - new Date();
      assume(until_exp).greaterThan(14 * 60 * 1000);
    });

  });

  suite('ping', function() {
    test('pings', async () => {
      await helper.login.ping();
    });
  });
});
