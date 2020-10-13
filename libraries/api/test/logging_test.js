const request = require('superagent');
const assert = require('assert');
const hawk = require('@hapi/hawk');
const { APIBuilder } = require('../');
const helper = require('./helper');
const _ = require('lodash');
const libUrls = require('taskcluster-lib-urls');
const testing = require('taskcluster-lib-testing');
const { LEVELS } = require('taskcluster-lib-monitor');

suite(testing.suiteName(), function() {
  // Create test api
  const builder = new APIBuilder({
    title: 'Test Api',
    description: 'Yet another test api',
    serviceName: 'test',
    apiVersion: 'v1',
  });

  // Create a mock authentication server
  setup(async () => {
    await helper.setupServer({ builder });
  });
  teardown(helper.teardownServer);

  builder.declare({
    method: 'get',
    route: '/require-some-scopes',
    name: 'requireSomeScopes',
    title: 'Require some scopes',
    description: 'Place we can call to test something',
    category: 'API Library',
    scopes: {
      AnyOf: [
        { AllOf: ['aa', 'bb'] },
        { AllOf: ['aa', 'bb', 'cc'] },
        { AllOf: ['bb', 'dd'] },
      ],
    },
  }, function(req, res) {
    res.reply({});
  });

  builder.declare({
    method: 'get',
    route: '/require-no-scopes',
    name: 'requireNoScopes',
    title: 'Require no scopes',
    category: 'API Library',
    description: 'Place we can call to test something',
    scopes: null,
  }, function(req, res) {
    res.reply({});
  });

  builder.declare({
    method: 'get',
    route: '/sometimes-require-no-scopes',
    name: 'sometimesRequireNoScopes',
    title: 'Require no scopes when private is false',
    description: 'Place we can call to test something',
    category: 'API Library',
    query: {
      private: /[01]/,
    },
    scopes: {
      if: 'private',
      then: 'aa',
    },
  }, async function(req, res) {
    await req.authorize({ private: req.query.private === '1' });
    res.reply({});
  });

  builder.declare({
    method: 'get',
    route: '/require-extra-scopes',
    name: 'requireExtraScopes',
    title: 'Require extra scopes',
    category: 'API Library',
    description: 'Place we can call to test something',
    scopes: 'XXXX',
  }, function(req, res) {
    res.reply({});
  });

  builder.declare({
    method: 'get',
    route: '/bewitiful',
    name: 'bewitiful',
    category: 'API Library',
    query: {
      foo: /abc*/,
    },
    title: 'Bewit having endpoint',
    description: 'Place we can call to test something',
    scopes: null,
  }, function(req, res) {
    res.reply({});
  });

  test('successful api method is logged', async function() {
    const url = libUrls.api(helper.rootUrl, 'test', 'v1', '/require-some-scopes');
    const { header } = hawk.client.header(url, 'GET', {
      credentials: { id: 'client-with-aa-bb-dd', key: 'ignored', algorithm: 'sha256' },
    });
    await request.get(url).set('Authorization', header);

    // We poll because the logging happens _after_ the response is sent
    // so there's nothing to await
    await testing.poll(async () => {
      assert.equal(helper.monitorManager.messages.length, 1);
      assert(helper.monitorManager.messages[0].Fields.duration > 0); // it exists..
      delete helper.monitorManager.messages[0].Fields.duration;
      assert(new Date(helper.monitorManager.messages[0].Fields.expires) > new Date());
      delete helper.monitorManager.messages[0].Fields.expires;
      assert.deepEqual(helper.monitorManager.messages[0], {
        Type: 'monitor.apiMethod',
        Severity: LEVELS.notice,
        Fields: {
          name: 'requireSomeScopes',
          apiVersion: 'v1',
          clientId: 'client-with-aa-bb-dd',
          // duration handled above
          hasAuthed: true,
          method: 'GET',
          public: false,
          query: {},
          resource: '/require-some-scopes',
          satisfyingScopes: ['aa', 'bb', 'dd'],
          sourceIp: '::ffff:127.0.0.1',
          statusCode: 200,
          v: 1,
        },
        Logger: 'taskcluster.lib-api',
      });
    }, 3, 100);
  });

  test('scope-less api method is logged', async function() {
    const url = libUrls.api(helper.rootUrl, 'test', 'v1', '/require-no-scopes');
    const { header } = hawk.client.header(url, 'GET', {
      credentials: { id: 'client-with-aa-bb-dd', key: 'ignored', algorithm: 'sha256' },
    });
    await request.get(url).set('Authorization', header);

    // We poll because the logging happens _after_ the response is sent
    // so there's nothing to await
    await testing.poll(async () => {
      assert.equal(helper.monitorManager.messages.length, 1);
      delete helper.monitorManager.messages[0].Fields.duration;
      delete helper.monitorManager.messages[0].Fields.expires;
      assert.deepEqual(helper.monitorManager.messages[0], {
        Type: 'monitor.apiMethod',
        Severity: LEVELS.notice,
        Fields: {
          name: 'requireNoScopes',
          apiVersion: 'v1',
          clientId: '',
          hasAuthed: false,
          method: 'GET',
          public: true,
          query: {},
          resource: '/require-no-scopes',
          satisfyingScopes: [],
          sourceIp: '::ffff:127.0.0.1',
          statusCode: 200,
          v: 1,
        },
        Logger: 'taskcluster.lib-api',
      });
    }, 3, 100);
  });

  test('optionally scope-less api method is logged without scopes', async function() {
    const url = libUrls.api(helper.rootUrl, 'test', 'v1', '/sometimes-require-no-scopes?private=0');
    const { header } = hawk.client.header(url, 'GET', {
      credentials: { id: 'client-with-aa-bb-dd', key: 'ignored', algorithm: 'sha256' },
    });
    await request.get(url).set('Authorization', header);

    await testing.poll(async () => {
      assert.equal(helper.monitorManager.messages.length, 1);
      delete helper.monitorManager.messages[0].Fields.duration;
      delete helper.monitorManager.messages[0].Fields.expires;
      assert.deepEqual(helper.monitorManager.messages[0], {
        Type: 'monitor.apiMethod',
        Severity: LEVELS.notice,
        Fields: {
          name: 'sometimesRequireNoScopes',
          apiVersion: 'v1',
          clientId: 'client-with-aa-bb-dd',
          hasAuthed: true,
          method: 'GET',
          public: false,
          query: {
            private: "0",
          },
          resource: '/sometimes-require-no-scopes',
          satisfyingScopes: [],
          sourceIp: '::ffff:127.0.0.1',
          statusCode: 200,
          v: 1,
        },
        Logger: 'taskcluster.lib-api',
      });
    }, 3, 100);
  });

  test('optionally scope-less api method is logged with scopes', async function() {
    const url = libUrls.api(helper.rootUrl, 'test', 'v1', '/sometimes-require-no-scopes?private=1');
    const { header } = hawk.client.header(url, 'GET', {
      credentials: { id: 'client-with-aa-bb-dd', key: 'ignored', algorithm: 'sha256' },
    });
    await request.get(url).set('Authorization', header);

    await testing.poll(async () => {
      assert.equal(helper.monitorManager.messages.length, 1);
      delete helper.monitorManager.messages[0].Fields.duration;
      delete helper.monitorManager.messages[0].Fields.expires;
      assert.deepEqual(helper.monitorManager.messages[0], {
        Type: 'monitor.apiMethod',
        Severity: LEVELS.notice,
        Fields: {
          name: 'sometimesRequireNoScopes',
          apiVersion: 'v1',
          clientId: 'client-with-aa-bb-dd',
          hasAuthed: true,
          method: 'GET',
          public: false,
          query: {
            private: 1,
          },
          resource: '/sometimes-require-no-scopes',
          satisfyingScopes: ['aa'],
          sourceIp: '::ffff:127.0.0.1',
          statusCode: 200,
          v: 1,
        },
        Logger: 'taskcluster.lib-api',
      });
    }, 3, 100);
  });

  test('unauthorized api method is logged', async function() {
    const url = libUrls.api(helper.rootUrl, 'test', 'v1', '/require-extra-scopes');
    const { header } = hawk.client.header(url, 'GET', {
      credentials: { id: 'client-with-aa-bb-dd', key: 'ignored', algorithm: 'sha256' },
    });
    try {
      await request.get(url).set('Authorization', header);
    } catch (err) {
      if (err.status !== 403) {
        throw err;
      }
    }

    await testing.poll(async () => {
      assert.equal(helper.monitorManager.messages.length, 1);
      delete helper.monitorManager.messages[0].Fields.duration;
      delete helper.monitorManager.messages[0].Fields.expires;
      assert.deepEqual(helper.monitorManager.messages[0], {
        Type: 'monitor.apiMethod',
        Severity: LEVELS.notice,
        Fields: {
          name: 'requireExtraScopes',
          apiVersion: 'v1',
          clientId: 'client-with-aa-bb-dd',
          hasAuthed: true,
          method: 'GET',
          public: false,
          query: {},
          resource: '/require-extra-scopes',
          satisfyingScopes: [],
          sourceIp: '::ffff:127.0.0.1',
          statusCode: 403,
          v: 1,
        },
        Logger: 'taskcluster.lib-api',
      });
    }, 3, 100);
  });

  test('bewit is elided', async function() {
    const url = libUrls.api(helper.rootUrl, 'test', 'v1', '/bewitiful?bewit=Y2xpZW50LXdpdGgtYWEtYmItZGRcMTYwMjE3NTYxM1xyVUErZWE1TWxUaWlZR1Vaak5KbE5pTFhnNnhCbXdhRDFxbnozQU1HZ2hJPVw&foo=abc');
    await request.get(url);

    await testing.poll(async () => {
      assert.equal(helper.monitorManager.messages.length, 1);
      delete helper.monitorManager.messages[0].Fields.duration;
      delete helper.monitorManager.messages[0].Fields.expires;
      assert.deepEqual(helper.monitorManager.messages[0], {
        Type: 'monitor.apiMethod',
        Severity: LEVELS.notice,
        Fields: {
          name: 'bewitiful',
          apiVersion: 'v1',
          clientId: '',
          hasAuthed: false,
          method: 'GET',
          public: true,
          query: {
            foo: 'abc',
            bewit: '...',
          },
          resource: '/bewitiful',
          satisfyingScopes: [],
          sourceIp: '::ffff:127.0.0.1',
          statusCode: 200,
          v: 1,
        },
        Logger: 'taskcluster.lib-api',
      });
    }, 3, 100);
  });

  test('unknown query params are not logged', async function() {
    const url = libUrls.api(helper.rootUrl, 'test', 'v1', '/bewitiful?bar=abc');
    const { header } = hawk.client.header(url, 'GET', {
      credentials: { id: 'client-with-aa-bb-dd', key: 'ignored', algorithm: 'sha256' },
    });
    try {
      await request.get(url).set('Authorization', header);
    } catch (err) {
      if (err.status !== 400) {
        throw err;
      }
    }

    await testing.poll(async () => {
      assert.equal(helper.monitorManager.messages.length, 1);
      delete helper.monitorManager.messages[0].Fields.duration;
      delete helper.monitorManager.messages[0].Fields.expires;
      assert.deepEqual(helper.monitorManager.messages[0], {
        Type: 'monitor.apiMethod',
        Severity: LEVELS.notice,
        Fields: {
          name: 'bewitiful',
          apiVersion: 'v1',
          clientId: '',
          hasAuthed: false,
          method: 'GET',
          public: true,
          query: {},
          resource: '/bewitiful',
          satisfyingScopes: [],
          sourceIp: '::ffff:127.0.0.1',
          statusCode: 400,
          v: 1,
        },
        Logger: 'taskcluster.lib-api',
      });
    }, 3, 100);
  });

  test('invalid query params are not logged', async function() {
    const url = libUrls.api(helper.rootUrl, 'test', 'v1', '/bewitiful?foo=def');
    const { header } = hawk.client.header(url, 'GET', {
      credentials: { id: 'client-with-aa-bb-dd', key: 'ignored', algorithm: 'sha256' },
    });
    try {
      await request.get(url).set('Authorization', header);
    } catch (err) {
      if (err.status !== 400) {
        throw err;
      }
    }

    await testing.poll(async () => {
      assert.equal(helper.monitorManager.messages.length, 1);
      delete helper.monitorManager.messages[0].Fields.duration;
      delete helper.monitorManager.messages[0].Fields.expires;
      assert.deepEqual(helper.monitorManager.messages[0], {
        Type: 'monitor.apiMethod',
        Severity: LEVELS.notice,
        Fields: {
          name: 'bewitiful',
          apiVersion: 'v1',
          clientId: '',
          hasAuthed: false,
          method: 'GET',
          public: true,
          query: {},
          resource: '/bewitiful',
          satisfyingScopes: [],
          sourceIp: '::ffff:127.0.0.1',
          statusCode: 400,
          v: 1,
        },
        Logger: 'taskcluster.lib-api',
      });
    }, 3, 100);
  });
});
