var taskcluster = require('taskcluster-client');
var helper = require('./helper');
var assume = require('assume');
var slugid = require('slugid');
var hawk = require('hawk');

// Tests that run against an active staging instance of the service to
// verify that it is, more or less, still functional.  This is not a full
// suite, but just enough to verify that it is up and still answering
// authenticateHawk requests.
//
// This is *not* part of the usual test-suite run, and should be invoked
// with `npm run checkStaging`.
suite('taskcluster-auth-staging check', function() {

  setup(function() {
    if (!helper.cfg.checkStaging.credentials) {
      console.log('run `heroku run -a taskcluster-auth-staging node bin/make-check-client.js` and ' +
        'set checkStaging.credentials in user-config.yml');
      this.skip();
    }
  });

  var auth = new taskcluster.Auth({
    baseUrl: helper.cfg.checkStaging.baseUrl,
  });

  test('can get a client (no auth required)', async function() {
    let clientId = helper.cfg.checkStaging.credentials.clientId;
    let client = await auth.client(clientId);
    assume(client.clientId).to.equal(clientId);
    assume(client.expandedScopes).to.contain('auth:create-client:garbage/*');
    assume(client.expandedScopes).to.contain('auth:delete-client:garbage/*');
  });

  test('can create and delete a client', async function() {
    var auth = new taskcluster.Auth({
      baseUrl: helper.cfg.checkStaging.baseUrl,
      credentials: helper.cfg.checkStaging.credentials,
    });

    let clientId = 'garbage/checkStaging/' + slugid.nice();
    let client = await auth.createClient(clientId, {
      description: 'delete me',
      expires: taskcluster.fromNow('1 minute'),
    });
    assume(client.clientId).to.equal(clientId);
    // clean up
    await auth.deleteClient(clientId);
  });

  test('can answer authenticateHawk requests', async function() {
    // just use a very basic request
    var credentials = helper.cfg.checkStaging.credentials;
    var data = {
      method: 'get',
      resource: '/',
      host: 'test.taskcluster.net',
      port: 443,
    };
    data.authorization = hawk.client.header(
      'https://' + data.host + data.resource, data.method, {
        credentials: {
          id: credentials.clientId,
          key: credentials.accessToken,
          algorithm: 'sha256',
        },
      }).field;

    let res = await auth.authenticateHawk(data);
    assume(res.status).to.equal('auth-success');
  });

  test('can answer authenticateHawk requests with a hash', async function() {
    // just use a very basic request
    var credentials = helper.cfg.checkStaging.credentials;
    var data = {
      method: 'get',
      resource: '/',
      host: 'test.taskcluster.net',
      port: 443,
    };
    data.authorization = hawk.client.header(
      'https://' + data.host + data.resource, data.method, {
        credentials: {
          id: credentials.clientId,
          key: credentials.accessToken,
          algorithm: 'sha256',
        },
        payload: '{}',
      }).field;
    console.log(data.authorization);

    let res = await auth.authenticateHawk(data);
    assume(res.status).to.equal('auth-success');
    assume(res.hash).to.equal('XtNvx1FqrUYVOLlne3l2WzcyRfj9QeC6YtmhMKKFMGY='); // hash of '{}'
  });
});
