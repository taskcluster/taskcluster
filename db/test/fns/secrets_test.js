import { strict as assert } from 'assert';
import testing from '@taskcluster/lib-testing';
import tc from '@taskcluster/client';
const { fromNow } = tc;
import helper from '../helper.js';
import slugid from 'slugid';

suite(testing.suiteName(), function () {
  helper.withDbForProcs({ serviceName: 'secrets' });

  setup('reset table', async function () {
    await helper.withDbClient(async client => {
      await client.query('delete from secrets');
      await client.query('delete from audit_history');
    });
  });

  const secrets = {};
  for (let i = 0; i < 10; i++) {
    secrets[`secret-${i}`] = {
      name: `secret-${i}`,
      encrypted_secret: { something: slugid.v4() },
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
        secret.encrypted_secret = JSON.parse(db.decrypt({ value: secret.encrypted_secret }).toString('utf8'));
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
      value: Buffer.from(JSON.stringify({ newValue: 10 }), 'utf8'),
    }), newExpires);
    const [secret] = await db.fns.get_secret('secret-8');
    assert.deepEqual(secret.expires, newExpires);
    assert.equal(JSON.parse(db.decrypt({ value: secret.encrypted_secret }).toString('utf8')).newValue, 10);
    // Now check that other values were not changed
    for await (const s of Object.values(secrets)) {
      if (s.name === 'secret-8') {
        continue;
      }
      const [secret] = await db.fns.get_secret(s.name);
      if (s.expires < new Date()) {
        assert.equal(undefined, secret);
      } else {
        secret.encrypted_secret = JSON.parse(db.decrypt({ value: secret.encrypted_secret }).toString('utf8'));
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
    const res = await db.fns.expire_secrets_return_names();
    assert.equal(res.length, 6);
    assert.deepEqual(res, Array.from({ length: 6 }).map((_, i) => ({ name: `secret-${i}` })));
    for await (const s of Object.values(secrets)) {
      const [secret] = await db.fns.get_secret(s.name);
      if (s.expires < new Date()) {
        assert.equal(undefined, secret);
      } else {
        secret.encrypted_secret = JSON.parse(db.decrypt({ value: secret.encrypted_secret }).toString('utf8'));
        assert.deepEqual(secret, s);
      }
    }
    await helper.withDbClient(async client => {
      const { rows: [{ count }] } = await client.query('select count(*) from secrets');
      assert.equal(count, '4');
    });
  });
  helper.dbTest('insert into secrets in audit history', async function (db, isFake) {

    await db.fns.insert_secrets_audit_history(
      'secret/1',
      'client-1',
      'created',
    );

    const rows = await helper.withDbClient(async client => {
      const result = await client.query(`
        SELECT client_id, action_type, created
        FROM audit_history
        WHERE entity_id = $1 AND entity_type = $2
      `, ['secret/1', 'secret']);
      return result.rows;
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].client_id, 'client-1');
    assert.equal(rows[0].action_type, 'created');
    assert(rows[0].created instanceof Date);

  });
});
