const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const debug = require('debug')('third_party_test');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);

  const getQuery = (url, sep='?') => {
    const qmark = url.indexOf(sep);
    if (qmark === -1) {
      return new URLSearchParams();
    }
    return new URLSearchParams(url.slice(qmark));
  };

  suite('integration', function() {
    test('implicit flow', async function() {
      const url = path => `http://127.0.0.1:${helper.serverPort}${path}`;
      const agent = await helper.signedInAgent();

      // user sent to /login/oauth/authorize with query args

      let res = await agent.get(url('/login/oauth/authorize' +
        '?response_type=token' +
        '&client_id=test-token' +
        '&redirect_uri=' + encodeURIComponent('https://test.example.com/cb') +
        '&scope=tags:get:*' +
        '&state=abc123' +
        '&expires=3+days'))
        .redirects(0)
        .ok(res => res.status === 302);

      // that will have redirected to the UI, so spot-check the redirect location
      debug(`redirected to ${res.header.location}`);
      assert(/\/third-party\?/.test(res.header.location));
      let query = getQuery(res.header.location);
      assert.equal(query.get('client_id'), 'test-token');
      assert.equal(query.get('expires'), '3 days');
      assert.equal(query.get('scope'), 'tags:get:*');
      const transactionId = query.get('transactionID');

      // user consents and UI dialog POSTs back to
      // /login/oauth/authorize/decision

      res = await agent.post(url('/login/oauth/authorize/decision'))
        .send('transaction_id=' + transactionId)
        .redirects(0)
        .ok(res => res.status === 302);

      debug(`redirected to ${res.header.location}`);
      assert(res.header.location.startsWith('https://test.example.com/cb#'));
      query = getQuery(res.header.location, '#');
      assert.equal(query.get('state'), 'abc123');
      if (query.has('error')) {
        throw new Error(query.get('error'));
      }
      assert.equal(query.get('token_type'), 'Bearer');

      // user calls /login/oauth/credentials to get TC credentials

      res = await agent.get(url('/login/oauth/credentials'))
        .set('authorization', `${query.get('token_type')} ${query.get('access_token')}`);

      // TODO: assert results
    });
  });
});
