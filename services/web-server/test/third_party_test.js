const assert = require('assert');
const taskcluster = require('taskcluster-client');
const testing = require('taskcluster-lib-testing');
const debug = require('debug')('third_party_test');
const request = require('superagent');
const moment = require('moment');
const helper = require('./helper');
const tryCatch = require('../src/utils/tryCatch');

helper.secrets.mockSuite(testing.suiteName(), ['azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withFakeAuth(mock, skipping);
  helper.withServer(mock, skipping);

  const url = path => `http://127.0.0.1:${helper.serverPort}${path}`;
  const getQuery = (url, sep = '?') => {
    const qmark = url.indexOf(sep);
    if (qmark === -1) {
      return new URLSearchParams();
    }
    return new URLSearchParams(url.slice(qmark + 1));
  };

  suite('unit', function() {
    test('authorization endpoint redirects to the third party page if user is not logged in', async function() {
      const registeredClientId = 'test-code';
      const query = new URLSearchParams({
        response_type: 'token',
        client_id: registeredClientId,
        redirect_uri: encodeURIComponent('https://test.example.com/cb'),
        scope: 'tags:get:*',
        state: 'abc123',
        expires: '3 days',
      }).toString();

      // user sent to /login/oauth/authorize with query arg

      const res = await request
        .get(url(`/login/oauth/authorize?${query}`))
        .redirects(0)
        .ok(res => res.status === 302);

      assert.equal(res.header.location, `/third-party?${query}`);
    });
    test('decision endpoint redirects to the third party page if user is not logged in', async function() {
      const formData = new URLSearchParams({
        clientId: `test/test/test`,
        transaction_id: '123',
        scope: 'tags:get:*',
        expires: '3019/04/01',
        description: 'test',
      }).toString();

      // user consents and UI dialog POSTs back to
      // /login/oauth/authorize/decision

      const res = await request.post(url('/login/oauth/authorize/decision'))
        .send(formData)
        .redirects(0)
        .ok(res => res.status === 302);

      assert.equal(res.header.location, '/third-party');
    });
    test('unauthorized_client when mismatch in redirect_uri', async function() {
      const agent = await helper.signedInAgent();

      // user sent to /login/oauth/authorize with query arg

      let [err, res] = await tryCatch(agent.get(url('/login/oauth/authorize' +
        '?response_type=token' +
        `&client_id=test-token` +
        `&redirect_uri=bad` +
        '&scope=tags:get:*' +
        '&state=abc123' +
        '&expires=3+days'))
        .redirects(0)
        .ok(res => res.status === 302));

      assert.equal(err.response.body.code, 'unauthorized_client');
      assert(!res);
    });
    test('unauthorized_client when client_id is not registered', async function() {
      const agent = await helper.signedInAgent();
      const redirectUri = 'https://test.example.com/cb';

      // user sent to /login/oauth/authorize with query arg

      let [err, res] = await tryCatch(agent.get(url('/login/oauth/authorize' +
        '?response_type=token' +
        `&client_id=qwerty` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        '&scope=tags:get:*' +
        '&state=abc123' +
        '&expires=3+days'))
        .redirects(0)
        .ok(res => res.status === 302));

      assert.equal(err.response.body.code, 'unauthorized_client');
      assert(!res);
    });
    test('invalid_request when missing required parameters', async function() {
      const agent = await helper.signedInAgent();
      const registeredClientId = 'test-token';
      const state = 'abc123';
      const redirectUri = 'https://test.example.com/cb';
      // Required parameters are outlined in https://tools.ietf.org/html/rfc6749#section-4.1.1
      const requiredParameters = ['response_type', 'client_id'];

      for (let parameter of requiredParameters) {
        const params = new URLSearchParams({
          response_type: 'token',
          client_id: registeredClientId,
          redirect_uri: encodeURIComponent(redirectUri),
          scope: 'tags:get:*',
          state,
          expires: '3 days',
        });

        params.delete(parameter);

        // user sent to /login/oauth/authorize with query arg

        const [err, res] = await tryCatch(
          agent
            .get(url(`/login/oauth/authorize?${params.toString()}`))
            .redirects(0)
            .ok(res => res.status === 302));

        assert.equal(err.response.body.code, 'invalid_request');
        assert(!res);
      }
    });
    test('invalid_scope', async function() {
      const agent = await helper.signedInAgent();
      const registeredClientId = 'test-token';
      const state = 'abc123';
      const redirectUri = 'https://test.example.com/cb';

      // user sent to /login/oauth/authorize with query arg

      let res = await agent.get(url('/login/oauth/authorize' +
        '?response_type=token' +
        `&client_id=${registeredClientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        // invalid scope
        '&scope=test' +
        `&state=${state}` +
        '&expires=3+days'))
        .redirects(0)
        .ok(res => res.status === 302);

      let query = getQuery(res.header.location);
      const formData = new URLSearchParams({
        clientId: query.get('clientId'),
        transaction_id: query.get('transactionID'),
        scope: query.get('scope'),
        expires: '3019/04/01',
        description: 'test',
      }).toString();

      // user consents and UI dialog POSTs back to
      // /login/oauth/authorize/decision

      res = await agent.post(url('/login/oauth/authorize/decision'))
        .send(formData)
        .redirects(0)
        .ok(res => res.status === 302);

      query = getQuery(res.header.location, '#');

      assert.equal(query.get('error'), 'invalid_scope');
      assert.equal(query.get('state'), state);
    });
    test('unsupported_response_type', async function() {
      const agent = await helper.signedInAgent();
      const registeredClientId = 'test-token';
      const state = 'abc123';
      const redirectUri = 'https://test.example.com/cb';

      // user sent to /login/oauth/authorize with query arg

      let res = await agent.get(url('/login/oauth/authorize' +
        // invalid response_type; should have been `token`
        '?response_type=code' +
        `&client_id=${registeredClientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        '&scope=tags:get:*' +
        `&state=${state}` +
        '&expires=3+days'))
        .redirects(0)
        .ok(res => res.status === 302);

      let query = getQuery(res.header.location);

      const formData = new URLSearchParams({
        transaction_id: query.get('transactionID'),
        scope: query.get('scope'),
        expires: '3019/04/01',
        description: 'test',
      }).toString();

      // user consents and UI dialog POSTs back to
      // /login/oauth/authorize/decision

      res = await agent.post(url('/login/oauth/authorize/decision'))
        .send(formData)
        .redirects(0)
        .ok(res => res.status === 302);

      query = getQuery(res.header.location);

      assert.equal(query.get('error'), 'unsupported_response_type');
      assert.equal(query.get('state'), state);
    });
    test('invalid transactionID', async function() {
      const agent = await helper.signedInAgent();
      const registeredClientId = 'test-code';
      const state = 'abc123';
      const redirectUri = 'https://test.example.com/cb';

      // user sent to /login/oauth/authorize with query arg

      let res = await agent.get(url('/login/oauth/authorize' +
        '?response_type=code' +
        `&client_id=${registeredClientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        '&scope=tags:get:*' +
        `&state=${state}` +
        '&expires=3+days'))
        .redirects(0)
        .ok(res => res.status === 302);

      let query = getQuery(res.header.location);

      const formData = new URLSearchParams({
        transaction_id: 'bad-transaction-id',
        scope: query.get('scope'),
        expires: '3019/04/01',
        description: 'test',
      }).toString();

      // user consents and UI dialog POSTs back to
      // /login/oauth/authorize/decision

      const [error] = await tryCatch(agent.post(url('/login/oauth/authorize/decision'))
        .send(formData)
        .redirects(0)
        .ok(res => res.status === 302));

      assert.equal(error.response.body.name, 'ForbiddenError');
    });
    test('maxExpires is respected', async function() {
      const agent = await helper.signedInAgent();
      const registeredClientId = 'test-token';

      // user sent to /login/oauth/authorize with query arg

      let res = await agent.get(url('/login/oauth/authorize' +
        '?response_type=token' +
        `&client_id=${registeredClientId}` +
        '&redirect_uri=' + encodeURIComponent('https://test.example.com/cb') +
        '&scope=tags:get:*' +
        '&state=abc123'))
        .redirects(0)
        .ok(res => res.status === 302);

      let query = getQuery(res.header.location);

      // user consents and UI dialog POSTs back to
      // /login/oauth/authorize/decision

      res = await agent.post(url('/login/oauth/authorize/decision'))
        .send(`clientId=${query.get('clientId')}`)
        .send(`transaction_id=${query.get('transactionID')}`)
        .send(`scope=${query.get('scope')}`)
        .send(`description='test'`)
        .send('expires=3019/04/01')
        .redirects(0)
        .ok(res => res.status === 302);

      query = getQuery(res.header.location, '#');

      res = await agent.get(url('/login/oauth/credentials'))
        .set('authorization', `${query.get('token_type')} ${query.get('access_token')}`);

      assert(new Date(res.body.expires) < taskcluster.fromNow('1 year'));
    });
    test('can request a client with expires less than maxExpires when client is whitelisted', async function() {
      const agent = await helper.signedInAgent();
      const registeredClientId = 'test-code-whitelisted';
      const redirectUri = 'https://test.example.com/cb';
      const fifteenMinutes = '15 minutes';

      // user sent to /login/oauth/authorize with query arg

      let res = await agent.get(url('/login/oauth/authorize' +
        '?response_type=code' +
        `&client_id=${registeredClientId}` +
        '&redirect_uri=' + encodeURIComponent(redirectUri) +
        '&expires=' + encodeURIComponent(fifteenMinutes) +
        '&scope=tags:get:*' +
        '&state=abc123'))
        .redirects(0)
        .ok(res => res.status === 302);

      let query = getQuery(res.header.location);

      // user calls /login/oauth/token

      res = await agent.post(url('/login/oauth/token'))
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('grant_type=authorization_code')
        .send(`code=${query.get('code')}`)
        .send(`redirect_uri=${encodeURIComponent(redirectUri)}`)
        .send(`client_id=${registeredClientId}`);

      // user calls /login/oauth/credentials to get TC credentials

      res = await agent.get(url('/login/oauth/credentials'))
        .set('authorization', `${res.body.token_type} ${res.body.access_token}`);

      assert(new Date(res.body.expires) < taskcluster.fromNow(fifteenMinutes));
    });
    test('skip decision step when client is whitelisted', async function() {
      const agent = await helper.signedInAgent();
      const registeredClientId = 'test-code-whitelisted';

      // user sent to /login/oauth/authorize with query args

      let res = await agent.get(url('/login/oauth/authorize' +
        '?response_type=code' +
        `&client_id=${registeredClientId}` +
        '&redirect_uri=' + encodeURIComponent('https://test.example.com/cb') +
        '&scope=tags:get:*' +
        '&state=abc123'))
        .redirects(0)
        .ok(res => res.status === 302);

      let query = getQuery(res.header.location);

      assert(query.get('code').length > 1);
    });
    test('invalid_grant - invalid code does not return an access token', async function() {
      const agent = await helper.signedInAgent();
      const registeredClientId = 'test-code-whitelisted';
      const redirectUri = 'https://test.example.com/cb';

      // user sent to /login/oauth/authorize with query args

      await agent.get(url('/login/oauth/authorize' +
        '?response_type=code' +
        `&client_id=${registeredClientId}` +
        '&redirect_uri=' + encodeURIComponent('https://test.example.com/cb') +
        '&scope=tags:get:*' +
        '&state=abc123'))
        .redirects(0)
        .ok(res => res.status === 302);

      // user calls /login/oauth/token

      const [error, response] = await tryCatch(agent.post(url('/login/oauth/token'))
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('grant_type=authorization_code')
        .send(`code=bad`)
        .send(`redirect_uri=${encodeURIComponent(redirectUri)}`)
        .send(`client_id=${registeredClientId}`));

      assert.equal(error.response.body.error, 'invalid_grant');
      assert(!response);
    });
    test('InputError when trying to get credentials of an expired client', async function() {
      const agent = await helper.signedInAgent();
      const registeredClientId = 'test-token';

      // user sent to /login/oauth/authorize with query arg

      let res = await agent.get(url('/login/oauth/authorize' +
        '?response_type=token' +
        `&client_id=${registeredClientId}` +
        '&redirect_uri=' + encodeURIComponent('https://test.example.com/cb') +
        '&scope=tags:get:*' +
        '&state=abc123'))
        .redirects(0)
        .ok(res => res.status === 302);

      let query = getQuery(res.header.location);
      const scope = query.get('scope');

      // user consents and UI dialog POSTs back to
      // /login/oauth/authorize/decision

      res = await agent.post(url('/login/oauth/authorize/decision'))
        .send(`clientId=${query.get('clientId')}`)
        .send(`transaction_id=${query.get('transactionID')}`)
        .send(`scope=${scope}`)
        .send(`description='test'`)
        .send('expires=2018/04/01')
        .redirects(0)
        .ok(res => res.status === 302);

      query = getQuery(res.header.location, '#');

      const [error] = await tryCatch(agent.get(url('/login/oauth/credentials'))
        .set('authorization', `${query.get('token_type')} ${query.get('access_token')}`));

      assert.equal(error.response.body.name, 'InputError');
      assert.equal(error.response.body.message, 'Could not generate credentials for this access token');
    });
  });
  suite('integration', function() {
    test('implicit flow', async function() {
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
      const clientId = query.get('clientId');
      assert.equal(query.get('client_id'), registeredClientId);
      assert.equal(expires, '3 days');
      assert.equal(scope, 'tags:get:*');
      assert(clientId.startsWith(`test/test/${registeredClientId}-`));
      const transactionId = query.get('transactionID');

      // user consents and UI dialog POSTs back to
      // /login/oauth/authorize/decision

      const expiry = moment(new Date()).startOf('day').add(3, 'days').format('YYYY/MM/DD');

      res = await agent.post(url('/login/oauth/authorize/decision'))
        .send(`clientId=${clientId}`)
        .send(`transaction_id=${transactionId}`)
        .send(`scope=${scope}`)
        .send(`description='test'`)
        .send(`expires=${expiry}`)
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

      const thirtySecondsBefore = new Date(expiry).setSeconds(new Date(expiry).getSeconds() - 30);

      assert.deepEqual(Object.keys(res.body).sort(), ['expires', 'credentials'].sort());
      assert.deepEqual(Object.keys(res.body.credentials).sort(), ['clientId', 'accessToken'].sort());
      assert.equal(res.body.expires, new Date(thirtySecondsBefore).toISOString());
      assert(res.body.credentials.clientId.startsWith(`test/test/${registeredClientId}-`));
    });

    test('authorization code flow', async function() {
      const agent = await helper.signedInAgent();
      const registeredClientId = 'test-code';
      const redirectUri = 'https://test.example.com/cb';
      const state = 'abc123';

      // user sent to /login/oauth/authorize with query args

      let res = await agent.get(url('/login/oauth/authorize' +
        '?response_type=code' +
        `&client_id=${registeredClientId}` +
        '&redirect_uri=' + encodeURIComponent(redirectUri) +
        '&scope=tags:get:*' +
        `&state=${state}` +
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
      const expiry = moment(new Date()).startOf('day').add(3, 'days').format('YYYY/MM/DD');

      // user consents and UI dialog POSTs back to
      // /login/oauth/authorize/decision

      res = await agent.post(url('/login/oauth/authorize/decision'))
        .send(`clientId=${query.get('clientId')}`)
        .send(`transaction_id=${transactionId}`)
        .send(`scope=${scope}`)
        .send(`description='test'`)
        .send(`expires=${expiry}`)
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

      res = await agent.get(url('/login/oauth/credentials'))
        .set('authorization', `${res.body.token_type} ${res.body.access_token}`);

      const thirtySecondsBefore = new Date(expiry).setSeconds(new Date(expiry).getSeconds() - 30);

      assert.deepEqual(Object.keys(res.body).sort(), ['expires', 'credentials'].sort());
      assert.deepEqual(Object.keys(res.body.credentials).sort(), ['clientId', 'accessToken'].sort());
      assert.equal(res.body.expires, new Date(thirtySecondsBefore).toISOString());
      assert(res.body.credentials.clientId.startsWith(`test/test/${registeredClientId}-`));
    });
  });
});
