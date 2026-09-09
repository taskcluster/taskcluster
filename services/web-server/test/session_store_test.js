import assert from 'node:assert';
import testing from '@taskcluster/lib-testing';
import session from 'express-session';
import { promisify } from 'node:util';
import helper from './helper.js';
import PostgresSessionStore from '../src/login/PostgresSessionStore.js';
import hash from '../src/utils/hash.js';

helper.secrets.mockSuite(testing.suiteName(), [], (mock, skipping) => {
  helper.withDb(mock, skipping);
  helper.withFakeAuth(skipping);
  helper.withServer(skipping);
  helper.resetTables();

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
      Object.getOwnPropertyNames(SessionStore.prototype)
        .filter(m => m !== 'constructor')
        .forEach(method => {
          store[method] = promisify(store[method]);
        });
    }

    return store;
  };

  suite('destroy', () => {
    test('it should destroy the specified session', async () => {
      const store = getStore();

      await store.set('foo', { cookie: {} });
      let val = await store.get('foo');

      assert.ok(val, 'entry exists');

      await store.destroy('foo');

      val = await store.get('foo');
      assert.equal(val, undefined, 'entry actually deleted');
    });
    test('it should destroy the specified session and call back', done => {
      const store = getStore(false /* shouldPromisify */);

      store.set('foo', { cookie: {} }, () => {
        store.destroy('foo', done);
      });
    });
  });

  suite('get', () => {
    test('it should get the specified session', async () => {
      const store = getStore();

      await store.set('foo', { cookie: {} });

      const val = await store.get('foo');

      assert.ok(val, 'entry exists');
    });
    test("it shouldn't get the specified session when only the hash matches", async () => {
      const store = getStore();

      const currentSession = 'sessionid1';
      const currentHash = hash(currentSession);

      const newSession = 'sessionid2';
      const newHash = hash(newSession);

      //creates a new session
      await store.set(currentSession, { cookie: {} });

      // updates the hash of that session
      await helper.withDbClient(async client => {
        await client.query('update sessions set hashed_session_id = $1 where hashed_session_id = $2', [
          newHash,
          currentHash,
        ]);
      });

      // tries to get the new session
      const val = await store.get(newSession);

      assert.equal(val, undefined);
    });
    test('it should get the specified session and call back', done => {
      const store = getStore(false /* shouldPromisify */);

      store.set('foo', { cookie: {} }, () => {
        store.get('foo', done);
      });
    });
    test("it should not error when session doesn't exist", async () => {
      const store = getStore();
      const val = await store.get('foo');

      assert.equal(val, undefined);
    });
  });

  suite('set', () => {
    test('it should set the specified session', async () => {
      const store = getStore();
      const data = { cookie: { foo: 'bar' } };

      await store.set('foo', data);

      const val = await store.get('foo');

      assert.deepEqual(val, data);
    });
    test('it should set the specified session and call back', done => {
      const store = getStore(false /* shouldPromisify */);

      store.set('foo', { cookie: {} }, done);
    });
  });

  suite('touch', () => {
    test('it should touch the specified session', async () => {
      const store = getStore();

      await store.set('foo', { cookie: { maxAge: 50 } });
      await store.touch('foo', { cookie: { maxAge: 300 } });

      const val = await store.get('foo');

      assert.equal(val.cookie.maxAge, 300, 'entry should be touched');
    });
    test('it should touch the specified session and call back', done => {
      const store = getStore(false /* shouldPromisify */);

      store.set('foo', { cookie: { maxAge: 50 } }, () => {
        store.touch('foo', { cookie: { maxAge: 300 } }, done);
      });
    });
    test('it should error when touching the session', async () => {
      const store = getStore();

      await assert.rejects(store.touch('foo', { cookie: { maxAge: 300 } }), /P0002/);
    });
  });

  suite('other', () => {
    test('it should inherit from the session Store', () => {
      const store = getStore();

      assert(store instanceof session.Store);
    });
  });
});
