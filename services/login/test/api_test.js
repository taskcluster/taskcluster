require('mocha')

suite('API', function() {
  var _           = require('lodash');
  var assume      = require('assume');
  var debug       = require('debug')('test:api');
  var helper      = require('./helper');
  var request     = require('superagent-promise')(require('superagent'), Promise);

  helper.setup();

  suite("credentialsFromAccessToken", function() {
    test("returns 400 for a call without a header", async function() {
      try {
        await helper.login.oidcCredentials('test');
      } catch (e) {
        assume(e.statusCode).to.equal(400);
        assume(e.code).to.equal('InputError');
        return;
      }
      throw new Error('should have failed');
    });

    test("returns credentials for 'test' provider", async function() {
      let res = await request
        .get(helper.baseUrl + '/oidc-credentials/test')
        .set('Authorization', 'Bearer let-me-in');
      let creds = JSON.parse(res.text);
      assume(creds.clientId).to.equal('test/let-me-in');
    });

  });

  suite("ping", function() {
    test("pings", async () => {
      await helper.login.ping();
    });
  });
});

