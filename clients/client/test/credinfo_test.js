const taskcluster = require('../');
const assert = require('assert');
const nock = require('nock');
const testing = require('./helper');

suite(testing.suiteName(), function() {
  teardown(function() {
    assert(nock.isDone());
    nock.cleanAll();
  });

  let setupNocks = function(options) {
    options = options || {};
    let client = {
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
    nock('https://tc-tests.example.com').get('/api/auth/v1/clients/clid')
      .reply(200, client);
    nock('https://tc-tests.example.com').get('/api/auth/v1/scopes/current')
      .reply(200, { scopes: options.scopes || [] });
  };

  test('permanent', async function() {
    setupNocks({ scopes: ['scope1'] });
    assert.deepEqual(
      await taskcluster.credentialInformation('https://tc-tests.example.com', { clientId: 'clid' }), {
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
      await taskcluster.credentialInformation('https://tc-tests.example.com', { clientId: 'clid' }), {
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
      await taskcluster.credentialInformation('https://tc-tests.example.com', { clientId: 'clid' }), {
        active: false,
        clientId: 'clid',
        type: 'permanent',
        scopes: ['scope1', 'scope2'],
        expiry: new Date('2100-02-17T05:00:00.000Z'),
      });
  });

  test('temporary', async function() {
    let start = taskcluster.fromNow('-1 hour');
    let expiry = taskcluster.fromNow('1 hour');
    let scopes = ['scope1', 'scope2'];
    let credentials = taskcluster.createTemporaryCredentials({
      start, expiry, scopes,
      credentials: {
        clientId: 'clid',
        accessToken: 'no-secret',
      },
    });

    setupNocks({ scopes: scopes });
    assert.deepEqual(
      await taskcluster.credentialInformation('https://tc-tests.example.com', credentials), {
        active: true,
        clientId: 'clid',
        type: 'temporary',
        scopes: scopes,
        start,
        expiry,
      });
  });

  test('temporary, expires after issuer', async function() {
    let start = taskcluster.fromNow('-1 hour');
    let expiry = taskcluster.fromNow('2 days');
    let scopes = ['scope1', 'scope2'];
    let credentials = taskcluster.createTemporaryCredentials({
      start, expiry, scopes,
      credentials: {
        clientId: 'clid',
        accessToken: 'no-secret',
      },
    });

    let permaExpiry = taskcluster.fromNow('1 day');
    setupNocks({ expires: permaExpiry.toJSON(), scopes });
    assert.deepEqual(
      await taskcluster.credentialInformation('https://tc-tests.example.com', credentials), {
        active: true,
        clientId: 'clid',
        type: 'temporary',
        scopes: scopes,
        start,
        expiry: permaExpiry,
      });
  });

  test('temporary, certificate as object', async function() {
    let start = taskcluster.fromNow('-1 hour');
    let expiry = taskcluster.fromNow('2 days');
    let scopes = ['scope1', 'scope2'];
    let credentials = taskcluster.createTemporaryCredentials({
      start, expiry, scopes,
      credentials: {
        clientId: 'clid',
        accessToken: 'no-secret',
      },
    });

    // make certificate an object, since both forms are accepted.
    credentials.certificate = JSON.parse(credentials.certificate);

    let permaExpiry = taskcluster.fromNow('1 day');
    setupNocks({ expires: permaExpiry.toJSON(), scopes });
    assert.deepEqual(
      await taskcluster.credentialInformation('https://tc-tests.example.com', credentials), {
        active: true,
        clientId: 'clid',
        type: 'temporary',
        scopes: scopes,
        start,
        expiry: permaExpiry,
      });
  });
});
