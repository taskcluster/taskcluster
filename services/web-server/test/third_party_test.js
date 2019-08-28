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
    return new URLSearchParams(url.slice(qmark + 1));
  };

  suite('integration', function() {
    test('implicit flow', async function() {
      const url = path => `http://127.0.0.1:${helper.serverPort}${path}`;
      const agent = await helper.signedInAgent();
      const registeredClientId = 'test-token';

      // user sent to /login/oauth/authorize with query args

      let res = await agent.get(url('/login/oauth/authorize' +
        '?response_type=token' +
        `&client_id=${registeredClientId}` +
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
      const scope = query.get('scope');
      const expires = query.get('expires');
      assert.equal(query.get('client_id'), registeredClientId);
      assert.equal(expires, '3 days');
      assert.equal(scope, 'tags:get:*');
      const transactionId = query.get('transactionID');

      // user consents and UI dialog POSTs back to
      // /login/oauth/authorize/decision

      res = await agent.post(url('/login/oauth/authorize/decision'))
        .send(`transaction_id=${transactionId}`)
        .send(`scope=${scope}`)
        .send(`description='test'`)
        .send('expires=3019/04/01')
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

      // TODO: the credentials endpoint calls auth.createClient which fails in testing
      // res = await agent.get(url('/login/oauth/credentials'))
      //   .set('authorization', `${query.get('token_type')} ${query.get('access_token')}`);

    });

    test('authorization code flow', async function() {
      const url = path => `http://127.0.0.1:${helper.serverPort}${path}`;
      const agent = await helper.signedInAgent();
      const registeredClientId = 'test-token-code';
      const redirectUri = 'https://test.example.com/cb';

      // user sent to /login/oauth/authorize with query args

      let res = await agent.get(url('/login/oauth/authorize' +
        '?response_type=code' +
        `&client_id=${registeredClientId}` +
        '&redirect_uri=' + encodeURIComponent(redirectUri) +
        '&scope=tags:get:*' +
        '&state=abc123' +
        '&expires=3+days'))
        .redirects(0)
        .ok(res => res.status === 302);

      // that will have redirected to the UI, so spot-check the redirect location
      debug(`redirected to ${res.header.location}`);
      assert(/\/third-party\?/.test(res.header.location));
      let query = getQuery(res.header.location);
      const scope = query.get('scope');
      const expires = query.get('expires');
      assert.equal(query.get('client_id'), registeredClientId);
      assert.equal(expires, '3 days');
      assert.equal(scope, 'tags:get:*');
      const transactionId = query.get('transactionID');

      // user consents and UI dialog POSTs back to
      // /login/oauth/authorize/decision

      res = await agent.post(url('/login/oauth/authorize/decision'))
        .send(`transaction_id=${transactionId}`)
        .send(`scope=${scope}`)
        .send(`description='test'`)
        .send('expires=3019/04/01')
        .redirects(0)
        .ok(res => res.status === 302);

      debug(`redirected to ${res.header.location}`);
      assert(res.header.location.startsWith('https://test.example.com/cb?'));
      query = getQuery(res.header.location);

      assert.equal(query.get('state'), 'abc123');
      if (query.has('error')) {
        throw new Error(query.get('error'));
      }
      assert(query.get('code'));

      // user calls /login/oauth/token

      res = await agent.post(url('/login/oauth/token'))
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('grant_type=authorization_code')
        .send(`code=${query.get('code')}`)
        .send(`redirect_uri=${encodeURIComponent(redirectUri)}`)
        .send(`client_id=${registeredClientId}`);

      assert.equal(res.body.token_type, 'Bearer');
      assert(res.body.access_token);

      // user calls /login/oauth/credentials to get TC credentials

      // TODO: the credentials endpoint calls auth.createClient which fails in testing
      // res = await agent.get(url('/login/oauth/credentials'))
      //   .set('authorization', `${query.get('token_type')} ${query.get('access_token')}`);
    });
  });
});
