const assert = require('assert');
const testing = require('taskcluster-lib-testing');
const session = require('express-session');
const { promisify } = require('util');
const helper = require('./helper');
const PostgresSessionStore = require('../src/login/PostgresSessionStore');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withFakeAuth(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  const getStore = (shouldPromisify = true, options) => {
    const SessionStore = PostgresSessionStore({
      session,
      db: helper.db,
      monitor: {
        log: {
          sessionStore: () => {},
        },
      },
      options,
    });
    const store = new SessionStore();

    if (shouldPromisify) {
      Object.getOwnPropertyNames( SessionStore.prototype )
        .filter(m => m !== 'constructor').forEach(method => {
          store[method] = promisify(store[method]);
        });
    }

    return store;
  };

  suite('destroy', function() {
    test('it should destroy the specified session', async function () {
      const store = getStore();

      await store.set('foo', {cookie: {}});
      let val = await store.get('foo');

      assert.ok(val, 'entry exists');

      await store.destroy('foo');

      val = await store.get('foo');
      assert.equal(val, undefined, 'entry actually deleted');
    });
    test('it should destroy the specified session and call back', function (done) {
      const store = getStore(false /* shouldPromisify */);

      store.set('foo', { cookie: {} }, function() {
        store.destroy('foo', done);
      });
    });
  });

  suite('get', function() {
    test('it should get the specified session', async function () {
      const store = getStore();

      await store.set('foo', { cookie: {} });

      const val = await store.get('foo');

      assert.ok(val, 'entry exists');
    });
    test('it should get the specified session and call back', function (done) {
      const store = getStore(false /* shouldPromisify */);

      store.set('foo', { cookie: {} }, () => {
        store.get('foo', done);
      });
    });
    test('it should not error when session doesn\'t exist', async function () {
      const store = getStore();
      const val = await store.get('foo');

      assert.equal(val, undefined);
    });
  });

  suite('set', function() {
    test('it should set the specified session', async function () {
      const store = getStore();
      const data = { cookie: { foo: 'bar' }};

      await store.set('foo', data);

      const val = await store.get('foo');

      assert.deepEqual(val, data);
    });
    test('it should set the specified session and call back', function (done) {
      const store = getStore(false /* shouldPromisify */);

      store.set('foo', { cookie: {} }, done);
    });
  });

  suite('touch', function() {
    test('it should touch the specified session', async function () {
      const store = getStore();

      await store.set('foo', { cookie: { maxAge: 50 } });
      await store.touch('foo', { cookie: { maxAge: 300 } });

      const val = await store.get('foo');

      assert.equal(val.cookie.maxAge, 300, 'entry should be touched');
    });
    test('it should touch the specified session and call back', function (done) {
      const store = getStore(false /* shouldPromisify */);

      store.set('foo', { cookie: { maxAge: 50 } }, () => {
        store.touch('foo', { cookie: { maxAge: 300 } }, done);
      });
    });
    test('it should error when touching the session', async function () {
      const store = getStore();

      await assert.rejects(
        store.touch('foo', { cookie: { maxAge: 300 } }),
        /P0002/,
      );
    });
  });

  suite('other', function() {
    test('it should inherit from the session Store', function () {
      const store = getStore();

      assert(store instanceof session.Store);
    });
  });
});
