const {pulseCredentials, claimedCredentials} = require('../src');
const assert = require('assert');
const assume = require('assume');
const libUrls = require('taskcluster-lib-urls');
const nock = require('nock');

suite('pulseCredentials', function() {
  test('missing arguments are an error', async function() {
    assume(() => pulseCredentials({password: 'pw', hostname: 'h', vhost: 'v'}))
      .throws(/username/);
    assume(() => pulseCredentials({username: 'me', hostname: 'h', vhost: 'v'}))
      .throws(/password/);
    assume(() => pulseCredentials({username: 'me', password: 'pw', vhost: 'v'}))
      .throws(/hostname/);
    assume(() => pulseCredentials({username: 'me', password: 'pw', hostname: 'v'}))
      .throws(/vhost/);
  });
  
  test('builds a connection string with given host', async function() {
    const credentials = await pulseCredentials({
      username: 'me',
      password: 'letmein',
      hostname: 'pulse.abc.com',
      vhost: '/',
    })();
  
    assert.equal(
      credentials.connectionString,
      'amqps://me:letmein@pulse.abc.com:5671/%2F');
  });
  
  test('builds a connection string with urlencoded values', async function() {
    const credentials = await pulseCredentials({
      username: 'ali-escaper:/@\\|()<>&',
      password: 'bobby-tables:/@\\|()<>&',
      hostname: 'pulse.abc.com',
      vhost: '/',
    })();
  
    assert.equal(
      credentials.connectionString,
      'amqps://ali-escaper:/@%5C%7C()%3C%3E&:bobby-tables:/@%5C%7C()%3C%3E&@pulse.abc.com:5671/%2F');
  });
});

suite('claimedCredentials', function() {
  test('missing arguments are an error', async function() {
    assume(() => claimedCredentials({credentials: {}, namespace: 'ns'}))
      .throws(/rootUrl/);
    assume(() => claimedCredentials({rootUrl: 'rU', namespace: 'ns'}))
      .throws(/credentials/);
    assume(() => claimedCredentials({rootUrl: 'rU', credentials: {}}))
      .throws(/namespace/);
  });
  
  test('calls Pulse.claimNamespace to claim a namespace', async function() {
    nock('http://fake')
      .post('/api/pulse/v1/namespace/ns')
      .reply(200, {namespace: 'ns', connectionString: 'cs'});

    const credentials = await claimedCredentials({
      rootUrl: 'http://fake',
      namespace: 'ns',
      credentials: {clientId: 'c', accessToken: 'a'},
    })();
  
    assert.equal(credentials.connectionString, 'cs');
  });
});
