import helper from './helper.js';
import debug from 'debug';

import {
  Schema,
  Database,
  ignorePgErrors,
  READ,
  DUPLICATE_OBJECT,
  UNDEFINED_COLUMN,
  UNDEFINED_TABLE,
  UNDEFINED_FUNCTION,
} from '../src/index.js';

import path from 'path';
import testing from 'taskcluster-lib-testing';
import { strict as assert } from 'assert';
import { dollarQuote } from '../src/util.js';

import {
  runMigration,
  runOnlineMigration,
  runDowngrade,
  runOnlineDowngrade,
  runOnlineBatches,
} from '../src/migration.js';

const __filename = new URL('', import.meta.url).pathname;

helper.dbSuite(path.basename(__filename), function() {
  let db;

  const showProgress = debug('showProgress');

  const createUsers = async db => {
    await db._withClient('admin', async client => {
      const usernames = ['test_service1', 'test_service2', 'badrole'];

      // create users (same as roles) so the grants will succeed
      for (const username of usernames) {
        try {
          await client.query(`create user ${username}`);
        } catch (err) {
          if (err.code !== DUPLICATE_OBJECT) {
            throw err;
          }
        }
      }
    });
    // start off the roles from a clean slate..
    await resetRoles(db);
  };

  const resetRoles = async db => {
    await db._withClient('admin', async client => {
      // drop attributes and group membership for all test_* users
      const res = await client.query(`
        select *
        from pg_catalog.pg_roles
        where rolname like 'test\_%'`);
      for (const row of res.rows) {
        // both of these are successful if they are no-ops (although they show warnings)
        await client.query(`alter role ${row.rolname} with nosuperuser nocreatedb nocreaterole noreplication`);
        await client.query(`revoke badrole from ${row.rolname}`);
      }
    });
  };

  suiteTeardown(async function() {
    db = new Database({ urlsByMode: { admin: helper.dbUrl } });
    await resetRoles(db);
  });

  teardown(async function() {
    if (db) {
      try {
        await db.close();
      } finally {
        db = null;
      }
    }
  });

  suite('runMigration', function() {
    suiteSetup(async function() {
      db = new Database({ urlsByMode: { admin: helper.dbUrl } });
      await createUsers(db);
    });

    setup(function() {
      db = new Database({ urlsByMode: { [READ]: helper.dbUrl, 'admin': helper.dbUrl } });
    });

    test('runs upgrade script with multiple statements and $db_user_prefix$', async function() {
      await db._withClient('admin', async client => {
        await runMigration({
          client,
          version: {
            version: 1,
            migrationScript: `begin
              create table foo as select 1 as bar;
              create table foo2 as select 2 as bar2;
              grant select on foo2 to $db_user_prefix$_service1;
            end`,
            methods: {},
          },
          showProgress,
          usernamePrefix: 'test',
        });
      });

      assert.equal(await db.currentVersion(), 1);
      await db._withClient(READ, async client => {
        let res = await client.query('select * from foo');
        assert.deepEqual(res.rows, [{ bar: 1 }]);
        res = await client.query('select * from foo2');
        assert.deepEqual(res.rows, [{ bar2: 2 }]);
      });
    });

    test('failure does not modify version', async function() {
      try {
        await db._withClient('admin', async client => {
          await runMigration({
            client,
            version: {
              version: 1,
              migrationScript: `begin
                select nosuchcolumn from tcversion;
              end`,
              methods: {},
            },
            showProgress,
            usernamePrefix: 'test',
          });
        });

      } catch (err) {
        assert.equal(err.code, UNDEFINED_COLUMN);
        assert.equal(await db.currentVersion(), 0);
        return;
      }
      throw new Error('runMigration did not fail');
    });

    test('allows deprecated methods without failing', async function() {
      await db._withClient('admin', async client => {
        await runMigration({
          client,
          version: {
            version: 1,
            methods: { foo_bar: {
              name: 'foo_bar',
              description: 'whatever',
              mode: 'read',
              serviceName: 'baz',
              args: 'foo integer',
              returns: 'table (bar integer)',
              body: 'begin end',
            } },
          },
          showProgress,
          usernamePrefix: 'test',
        });
      });

      assert.equal(await db.currentVersion(), 1);
      await db._withClient('admin', async client => {
        await runMigration({
          client,
          version: {
            version: 2,
            methods: {
              foo_bar: {
                name: 'foo_bar',
                deprecated: true,
              },
            },
          },
          showProgress,
          usernamePrefix: 'test',
        });
      });

      assert.equal(await db.currentVersion(), 2);
    });
  });

  suite('runOnlineMigration/runOnlineDowngrade', function() {
    suiteSetup(async function() {
      db = new Database({ urlsByMode: { admin: helper.dbUrl } });
      await createUsers(db);
    });

    setup(async function() {
      runOnlineBatches.resetHooks();
      db = new Database({ urlsByMode: { [READ]: helper.dbUrl, 'admin': helper.dbUrl } });
      await db._withClient('admin', async client => {
        await client.query('create table tcversion as select 1 as version');
        for (let v of [0, 1, 2, 3]) {
          for (let fn of [
            `online_migration_v${v}_batch`,
            `online_migration_v${v}_is_complete`,
            `online_downgrade_v${v}_batch`,
            `online_downgrade_v${v}_is_complete`,
          ]) {
            await ignorePgErrors(client.query(`drop function ${fn}`), UNDEFINED_FUNCTION);
          }
        }
      });
    });

    teardown(async function() {
      await db._withClient('admin', async client => {
        await ignorePgErrors(client.query('drop table online_test'), UNDEFINED_TABLE);
      });
    });

    const mkBatchFn = async ({ client, name, body }) => {
      await client.query(
        `create or replace function ${name}(batch_size_in integer, state_in jsonb)
        returns table (count integer, state jsonb)
        as ${dollarQuote(body)}
        language plpgsql`);
    };

    const mkIsCompleteFn = async ({ client, name, body }) => {
      await client.query(
        `create or replace function ${name}()
        returns boolean
        as ${dollarQuote(body)}
        language plpgsql`);
    };

    test('does nothing when there is no batch function', async function() {
      await db._withClient('admin', async client => {
        await runOnlineMigration({ client, showProgress, version: { version: 1 } });
      });
      // just doesn't throw anything..
    });

    test('does nothing when the online migration is already complete', async function() {
      await db._withClient('admin', async client => {
        await mkBatchFn({
          client,
          name: 'online_migration_v1_batch',
          body: `begin
            raise exception 'uhoh' using hint = 'intentional error', errcode = '0A000';
          end`,
        });
        await mkIsCompleteFn({
          client,
          name: 'online_migration_v1_is_complete',
          body: `begin
            return true;
          end`,
        });
        await runOnlineMigration({ client, showProgress, version: { version: 1 } });
      });
      // just doesn't throw anything..
    });

    test('runs a real migration', async function() {
      await db._withClient('admin', async client => {
        await client.query(`
          create table online_test as
          select
            generate_series as positive, null::integer as negative
          from generate_series(1, 100000)`);
        await client.query(`alter table online_test add primary key (positive)`);
        await mkBatchFn({
          client,
          name: 'online_migration_v1_batch',
          body: `declare
            last_positive integer;
            count integer;
            row record;
          begin
            last_positive := state -> last_positive;
            count := 0;

            for row in
              select *
              from online_test
              where
                (last_positive is null or positive > last_positive) and
                negative is null
              order by positive
              limit batch_size_in
            loop
              update online_test
              set negative = -positive
              where positive = row.positive;

              count := count + 1;
              last_positive := row.positive;
            end loop;

            return query select
              count,
              jsonb_build_object('last_positive', last_positive) as state;
          end`,
        });
        await mkIsCompleteFn({
          client,
          name: 'online_migration_v1_is_complete',
          body: `begin
            perform * from online_test where negative is null limit 1;
            return not found;
          end`,
        });
        await runOnlineMigration({ client, showProgress, version: { version: 1 } });

        // check that it migrated correctly..
        await db._withClient('admin', async client => {
          const res = await client.query(`
            select * from online_test
            where negative != -positive
          `);
          assert.deepEqual(res.rows, []);
        });
      });
    });

    test('batch function that just does one item per iteration', testing.runWithFakeTime(async function() {
      let itemsComplete = 0;
      runOnlineBatches.setHook('runBatch', async (batchSize, state) => {
        if (itemsComplete >= 1000) {
          return { state, count: 0 };
        }
        itemsComplete += 1;
        await testing.sleep(100);
        return { state, count: 1 };
      });
      runOnlineBatches.setHook('isComplete', async () => itemsComplete >= 1000);

      await runOnlineMigration({ showProgress, version: { version: 1 } });

      assert.equal(itemsComplete, 1000);
    }, { maxTime: Infinity }));

    test('batch function that returns 0 items early', testing.runWithFakeTime(async function() {
      let itemsComplete = 0;
      let isCompleteCalls = 0;
      runOnlineBatches.setHook('runBatch', async (batchSize, state) => {
        state.counter = (state.counter || 0) + 1;
        if (state.counter === 100 || itemsComplete >= 1000) {
          // this will trigger an isComplete call, and if not complete, starts over with
          // a fresh state
          return { state, count: 0 };
        }
        itemsComplete += 1;
        await testing.sleep(100);
        return { state, count: 1 };
      });
      runOnlineBatches.setHook('isComplete', async () => {
        isCompleteCalls++;
        return (itemsComplete >= 1000);
      });

      await runOnlineMigration({ showProgress, version: { version: 1 } });

      assert.equal(itemsComplete, 1000);
      assert.equal(isCompleteCalls, 12);
    }, { maxTime: Infinity }));

    test('(downgrade) batch function that just does more items than requested per iteration', testing.runWithFakeTime(async function() {
      let itemsComplete = 0;
      runOnlineBatches.setHook('runBatch', async (batchSize, state) => {
        if (itemsComplete >= 1000) {
          return { state, count: 0 };
        }
        batchSize = Math.max(batchSize + 2, 1000 - itemsComplete);
        itemsComplete += batchSize;
        await testing.sleep(batchSize * 10); // one item takes 10ms (fake time)
        return { state, count: batchSize };
      });
      runOnlineBatches.setHook('isComplete', async () => itemsComplete >= 1000);

      await runOnlineDowngrade({ showProgress, version: { version: 1 } });

      assert.equal(itemsComplete, 1000);
    }));
  });

  suite('runDowngrade', function() {
    suiteSetup(async function() {
      db = new Database({ urlsByMode: { admin: helper.dbUrl } });
      await createUsers(db);
    });

    const v1 = {
      version: 1,
      methods: {
        test: {
          args: '',
          returns: 'int',
          mode: 'read',
          serviceName: 'service-1',
          description: 'test v1',
          body: 'begin return 1; end',
        },
      },
    };

    const v2 = {
      version: 2,
      migrationScript: `begin
        create table foo as select 1 as bar;
        grant select on foo to $db_user_prefix$_service1;
      end`,
      downgradeScript: `begin
        revoke select on foo from $db_user_prefix$_service1;
        drop table foo;
      end`,
      methods: {},
    };

    const v3 = {
      version: 3,
      migrationScript: `begin
        create table foo2 as select 1 as bar;
        grant select on foo2 to $db_user_prefix$_service2;
      end`,
      downgradeScript: `begin
        revoke select on foo2 from $db_user_prefix$_service2;
        drop table foo2;
      end`,
      methods: {
        test: {
          args: '',
          returns: 'int',
          mode: 'read',
          serviceName: 'service-1',
          description: 'test v3',
          body: 'begin return 3; end',
        },
      },
    };
    const v4 = {
      version: 4,
      methods: {
        test: {
          deprecated: true,
        },
      },
    };
    const access = {};
    const tables = {};
    const schema = Schema.fromSerializable({ versions: [v1, v2, v3, v4], access, tables });

    const testMethod = async (client, v) => {
      const res = await client.query('select test()');
      assert.equal(res.rows[0].test, v);
    };

    setup(async function() {
      db = new Database({ urlsByMode: { [READ]: helper.dbUrl, 'admin': helper.dbUrl } });
      for (let version of [schema.getVersion(1), schema.getVersion(2), schema.getVersion(3)]) {
        await db._withClient('admin', async client => {
          await runMigration({
            client,
            version,
            showProgress,
            usernamePrefix: 'test',
          });
        });

      }
    });

    test('runs downgrade script with multiple statements and $db_user_prefix$', async function() {
      await db._withClient('admin', async client => {
        await runDowngrade({
          client,
          schema,
          fromVersion: schema.getVersion(3),
          toVersion: schema.getVersion(2),
          showProgress,
          usernamePrefix: 'test',
        });
      });

      assert.equal(await db.currentVersion(), 2);
      await db._withClient('admin', async client => {
        await assert.rejects(async () => {
          await client.query('select * from foo2');
        }, err => err.code === UNDEFINED_TABLE);
        // method is now the v1 method
        await testMethod(client, 1);
      });
    });

    test('failure does not modify version', async function() {
      await db._withClient('admin', async client => {
        await assert.rejects(
          async () => runDowngrade({
            client,
            schema,
            fromVersion: {
              ...schema.getVersion(3),
              downgradeScript: `begin
                drop table NOSUCHTABLE;
              end`,
            },
            toVersion: schema.getVersion(2),
            showProgress,
            usernamePrefix: 'test',
          }),
          err => err.code === UNDEFINED_TABLE);
      });
      assert.equal(await db.currentVersion(), 3);
      await db._withClient('admin', async client => {
        // method is still the v3 method
        await testMethod(client, 3);
      });
    });

    test('allows deprecated methods without failing', async function() {
      await db._withClient('admin', async client => {
        await runMigration({
          client,
          version: schema.getVersion(4),
          showProgress,
          usernamePrefix: 'test',
        });
      });

      await db._withClient('admin', async client => {
        await runDowngrade({
          client,
          schema,
          fromVersion: schema.getVersion(4),
          toVersion: schema.getVersion(3),
          showProgress,
          usernamePrefix: 'test',
        });
      });

      assert.equal(await db.currentVersion(), 3);
    });
  });
});
