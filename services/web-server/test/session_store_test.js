const assert = require('assert');
const testing = require('taskcluster-lib-testing');
const session = require('express-session');
const { promisify } = require('util');
const helper = require('./helper');
const PostgresSessionStore = require('../src/login/PostgresSessionStore');
const hash = require('../src/utils/hash');

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

      await store.set('foo', { cookie: {} });
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
    test('it shouldn\'t get the specified session when only the hash matches', async function () {
      const store = getStore();

      const currentSession = 'sessionid1';
      const currentHash = hash(currentSession);

      const newSession = 'sessionid2';
      const newHash = hash(newSession);

      //creates a new session
      await store.set(currentSession, { cookie: {} });

      // updates the hash of that session
      await helper.db._withDbClient(async client => {
        await client.query('update sessions set hashed_session_id = $1 where hashed_session_id = $2', [newHash, currentHash]);
      });

      // tries to get the new session
      const val = await store.get(newSession);

      assert.equal(val, undefined);
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
      const data = { cookie: { foo: 'bar' } };

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
