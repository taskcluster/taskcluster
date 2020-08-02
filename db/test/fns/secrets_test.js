const assert = require('assert').strict;
const testing = require('taskcluster-lib-testing');
const { fromNow } = require('taskcluster-client');
const helper = require('../helper');
const slugid = require('slugid');

suite(testing.suiteName(), function () {
  helper.withDbForProcs({ serviceName: 'secrets' });

  setup('reset table', async function () {
    await helper.withDbClient(async client => {
      await client.query('delete from secrets');
    });
  });

  const secrets = {};
  for (let i = 0; i < 10; i++) {
    secrets[`secret-${i}`] = {
      name: `secret-${i}`,
      encrypted_secret: {something: slugid.v4()},
      expires: fromNow(`${i - 5} days`), // half expired half new
    };
  }

  helper.dbTest('create and get', async function (db, isFake) {
    for await (const s of Object.values(secrets)) {
      await db.fns.upsert_secret(s.name, db.encrypt({
        value: Buffer.from(JSON.stringify(s.encrypted_secret), 'utf8'),
      }), s.expires);
    }
    for await (const s of Object.values(secrets)) {
      const [secret] = await db.fns.get_secret(s.name);
      if (s.expires < new Date()) {
        assert.equal(undefined, secret);
      } else {
        secret.encrypted_secret = JSON.parse(db.decrypt({value: secret.encrypted_secret}).toString('utf8'));
        assert.deepEqual(secret, s);
      }
    }
  });
  helper.dbTest('list', async function (db, isFake) {
    for await (const s of Object.values(secrets)) {
      await db.fns.upsert_secret(s.name, db.encrypt({
        value: Buffer.from(JSON.stringify(s.encrypted_secret), 'utf8'),
      }), s.expires);
    }
    const fetched = await db.fns.get_secrets(null, null);
    assert.equal(fetched.length, 4);
    fetched.forEach((secret, i) => {
      const s = secrets[secret.name];
      assert(s);
      assert(s.expires > new Date());
    });
  });
  helper.dbTest('delete', async function (db, isFake) {
    for await (const s of Object.values(secrets)) {
      await db.fns.upsert_secret(s.name, db.encrypt({
        value: Buffer.from(JSON.stringify(s.encrypted_secret), 'utf8'),
      }), s.expires);
    }
    assert.notDeepEqual([], await db.fns.get_secret('secret-9'));
    await db.fns.delete_secret('secret-9');
    const fetched = await db.fns.get_secrets(null, null);
    assert.equal(fetched.length, 3);
    fetched.forEach((secret, i) => {
      const s = secrets[secret.name];
      assert(s);
      assert(s.expires > new Date());
    });
    assert.deepEqual([], await db.fns.get_secret('secret-9'));
  });
  helper.dbTest('update', async function (db, isFake) {
    for await (const s of Object.values(secrets)) {
      await db.fns.upsert_secret(s.name, db.encrypt({
        value: Buffer.from(JSON.stringify(s.encrypted_secret), 'utf8'),
      }), s.expires);
    }
    const newExpires = fromNow('1 year');
    await db.fns.upsert_secret('secret-8', db.encrypt({
      value: Buffer.from(JSON.stringify({newValue: 10}), 'utf8'),
    }), newExpires);
    const [secret] = await db.fns.get_secret('secret-8');
    assert.deepEqual(secret.expires, newExpires);
    assert.equal(JSON.parse(db.decrypt({value: secret.encrypted_secret}).toString('utf8')).newValue, 10);
    // Now check that other values were not changed
    for await (const s of Object.values(secrets)) {
      if (s.name === 'secret-8') {
        continue;
      }
      const [secret] = await db.fns.get_secret(s.name);
      if (s.expires < new Date()) {
        assert.equal(undefined, secret);
      } else {
        secret.encrypted_secret = JSON.parse(db.decrypt({value: secret.encrypted_secret}).toString('utf8'));
        assert.deepEqual(secret, s);
      }
    }
  });
  helper.dbTest('expire', async function (db, isFake) {
    for await (const s of Object.values(secrets)) {
      await db.fns.upsert_secret(s.name, db.encrypt({
        value: Buffer.from(JSON.stringify(s.encrypted_secret), 'utf8'),
      }), s.expires);
    }
    await db.fns.expire_secrets();
    for await (const s of Object.values(secrets)) {
      const [secret] = await db.fns.get_secret(s.name);
      if (s.expires < new Date()) {
        assert.equal(undefined, secret);
      } else {
        secret.encrypted_secret = JSON.parse(db.decrypt({value: secret.encrypted_secret}).toString('utf8'));
        assert.deepEqual(secret, s);
      }
    }
    await helper.withDbClient(async client => {
      const {rows: [{count}]} = await client.query('select count(*) from secrets');
      assert.equal(count, '4');
    });
  });
});
