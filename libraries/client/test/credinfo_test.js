suite('taskcluster.credentialInfo', function() {
  var taskcluster     = require('../');
  var assert          = require('assert');
  var nock            = require('nock');

  teardown(function() {
    assert(nock.isDone());
    nock.cleanAll();
  });

  var setupNocks = function(options) {
    options = options || {};
    var client = {
      clientId: 'clid',
      description: 'TEST',
      expires: options.expires || '2100-02-17T05:00:00.000Z',
      created: '2016-02-15T12:59:53.371Z',
      lastModified: '2016-02-15T20:26:14.896Z',
      lastDateUsed: '2016-02-15T12:59:53.371Z',
      lastRotated: '2016-02-15T12:59:53.371Z',
      scopes: ['*'],
      expandedScopes: ['*'],
      disabled: !!options.disabled,
    };
    nock('https://auth.taskcluster.net').get('/v1/clients/clid')
      .reply(200, client);
    nock('https://auth.taskcluster.net').get('/v1/scopes/current')
      .reply(200, {scopes: options.scopes || []});
  };

  test('permanent', async function() {
    setupNocks({scopes: ['scope1']});
    assert.deepEqual(
      await taskcluster.credentialInformation('https://taskcluster.net', {clientId: 'clid'}), {
        active: true,
        clientId: 'clid',
        type: 'permanent',
        scopes: ['scope1'],
        expiry: new Date('2100-02-17T05:00:00.000Z'),
      });
  });

  test('permanent, expired', async function() {
    setupNocks({
      expires: '2000-12-31T23:59:59.999Z',
      scopes: ['scope1'],
    });
    assert.deepEqual(
      await taskcluster.credentialInformation('https://taskcluster.net', {clientId: 'clid'}), {
        active: false,
        clientId: 'clid',
        type: 'permanent',
        scopes: ['scope1'],
        expiry: new Date('2000-12-31T23:59:59.999Z'),
      });
  });

  test('permanent, disabled', async function() {
    setupNocks({
      disabled: true,
      scopes: ['scope1', 'scope2'],
    });
    assert.deepEqual(
      await taskcluster.credentialInformation('https://taskcluster.net', {clientId: 'clid'}), {
        active: false,
        clientId: 'clid',
        type: 'permanent',
        scopes: ['scope1', 'scope2'],
        expiry: new Date('2100-02-17T05:00:00.000Z'),
      });
  });

  test('temporary', async function() {
    var start = taskcluster.fromNow('-1 hour');
    var expiry = taskcluster.fromNow('1 hour');
    var scopes = ['scope1', 'scope2'];
    var credentials = taskcluster.createTemporaryCredentials({
      start, expiry, scopes,
      credentials: {
        clientId: 'clid',
        accessToken: 'no-secret',
      },
    });

    setupNocks({scopes: scopes});
    assert.deepEqual(
      await taskcluster.credentialInformation('https://taskcluster.net', credentials), {
        active: true,
        clientId: 'clid',
        type: 'temporary',
        scopes: scopes,
        start,
        expiry,
      });
  });

  test('temporary, expires after issuer', async function() {
    var start = taskcluster.fromNow('-1 hour');
    var expiry = taskcluster.fromNow('2 days');
    var scopes = ['scope1', 'scope2'];
    var credentials = taskcluster.createTemporaryCredentials({
      start, expiry, scopes,
      credentials: {
        clientId: 'clid',
        accessToken: 'no-secret',
      },
    });

    var permaExpiry = taskcluster.fromNow('1 day');
    setupNocks({expires: permaExpiry.toJSON(), scopes});
    assert.deepEqual(
      await taskcluster.credentialInformation('https://taskcluster.net', credentials), {
        active: true,
        clientId: 'clid',
        type: 'temporary',
        scopes: scopes,
        start,
        expiry: permaExpiry,
      });
  });

  test('temporary, certificate as object', async function() {
    var start = taskcluster.fromNow('-1 hour');
    var expiry = taskcluster.fromNow('2 days');
    var scopes = ['scope1', 'scope2'];
    var credentials = taskcluster.createTemporaryCredentials({
      start, expiry, scopes,
      credentials: {
        clientId: 'clid',
        accessToken: 'no-secret',
      },
    });

    // make certificate an object, since both forms are accepted.
    credentials.certificate = JSON.parse(credentials.certificate);

    var permaExpiry = taskcluster.fromNow('1 day');
    setupNocks({expires: permaExpiry.toJSON(), scopes});
    assert.deepEqual(
      await taskcluster.credentialInformation('https://taskcluster.net', credentials), {
        active: true,
        clientId: 'clid',
        type: 'temporary',
        scopes: scopes,
        start,
        expiry: permaExpiry,
      });
  });
});
