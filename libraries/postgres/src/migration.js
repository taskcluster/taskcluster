const assert = require('assert').strict;
const { dollarQuote, ETA } = require('./util');
const { UNDEFINED_FUNCTION } = require('./constants');

const inTransaction = async (client, callable) => {
  await client.query('begin');
  try {
    await callable();
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  }
};

const lockVersionTable = async ({ client, expectedVersion }) => {
  // check the version and lock it to prevent other things from changing it
  const res = await client.query('select version from tcversion for update');
  if (res.rowCount !== 1 || res.rows[0].version !== expectedVersion) {
    throw Error('Multiple DB upgrades running simultaneously');
  }
};

const runScript = async ({ client, script, usernamePrefix }) => {
  const finalScript = script.replace(/\$db_user_prefix\$/g, usernamePrefix);
  await client.query(`DO ${dollarQuote(finalScript)}`);
};

const defineMethod = async ({ client, method }) => {
  assert(method.name, method);
  await client.query(`create or replace function
  "${method.name}"(${method.args})
  returns ${method.returns}
  as ${dollarQuote(method.body)}
  language plpgsql`);
};

const fnExists = async ({ client, name }) => {
  // https://stackoverflow.com/questions/24773603/how-to-find-if-a-function-exists-in-postgresql
  try {
    await client.query(`select '${name}'::regproc`);
    return true;
  } catch (err) {
    if (err.code === UNDEFINED_FUNCTION) {
      return false;
    }
    throw err;
  }
};

const dropOnlineFns = async ({ client, kind, versionNum, showProgress }) => {
  showProgress('..ensuring online functions are removed');
  await client.query(`
  drop function if exists online_${kind}_v${versionNum}_batch(batch_size_in integer, state_in jsonb)`);
  await client.query(`
  drop function if exists online_${kind}_v${versionNum}_is_complete()`);
};

const runMigration = async ({ client, version, showProgress, usernamePrefix }) => {
  await inTransaction(client, async () => {
    if (version.version === 1) {
      await client.query('create table if not exists tcversion as select 0 as version');
    }

    await lockVersionTable({ client, expectedVersion: version.version - 1 });

    if (version.migrationScript) {
      showProgress('..running migration script');
      await runScript({ client, script: version.migrationScript, usernamePrefix });
    }

    showProgress('..defining methods');
    for (let method of Object.values(version.methods)) {
      if (method.deprecated && !method.args && !method.returns && !method.body) {
        continue; // This allows just deprecating without changing a method
      }
      showProgress(`   defining ${method.name}`);
      await defineMethod({ client, method });
    }

    showProgress('..updating version');
    await client.query('update tcversion set version = $1', [version.version]);
  });
};

const runDowngrade = async ({ client, schema, fromVersion, toVersion, showProgress, usernamePrefix }) => {
  await inTransaction(client, async () => {
    await lockVersionTable({ client, expectedVersion: fromVersion.version });

    if (fromVersion.downgradeScript) {
      showProgress('..running downgrade script');
      await runScript({ client, script: fromVersion.downgradeScript, usernamePrefix });
    }

    // either find the most recent definition of each function,
    // or drop the function if it was not defined before fromVersion
    showProgress('..redefining methods');
    for (let [methodName, { args }] of Object.entries(fromVersion.methods)) {
      let foundMethod = false;
      for (let ver = toVersion.version; ver > 0; ver--) {
        const version = schema.getVersion(ver);
        if (methodName in version.methods) {
          showProgress(`   using ${methodName} from db version ${version.version}`);
          await defineMethod({ client, method: version.methods[methodName] });
          foundMethod = true;
          break;
        }
      }
      if (!foundMethod) {
        showProgress(`   dropping ${methodName}`);
        await client.query(`drop function "${methodName}"(${args})`);
      }
    }

    showProgress('..updating version');
    await client.query('update tcversion set version = $1', [toVersion.version]);
  });
};

// Hooks for testing -- this is always {} in production
let hooks = {};

/**
 * Run an online migration/downgrade's batches sequentially, until complete.
 *
 * This tries to run batches that take about 1s to complete.  When
 * a batch affects zero items, it checks for completion, and repeats
 * if the completion function returns false.
 */
const runOnlineBatches = async ({ client, showProgress, versionNum, kind }) => {
  const batchFn = `online_${kind}_v${versionNum}_batch`;
  const isCompleteFn = `online_${kind}_v${versionNum}_is_complete`;

  const runBatch = hooks['runBatch'] || (async (batchSize, state) => {
    let res;
    // expect the version to already be incremented (migration) or decremented (downgrade)
    const expectedVersion = kind === 'migration' ? versionNum : versionNum - 1;

    await inTransaction(client, async () => {
      await lockVersionTable({ client, expectedVersion });
      res = await client.query(
        `select * from ${batchFn}($1, $2)`,
        [batchSize, state]);
    });
    assert(res.rows.length === 1);
    return { state: res.rows[0].state, count: res.rows[0].count };
  });

  const isComplete = hooks['isComplete'] || (async () => {
    const res = await client.query(
      `select * from ${isCompleteFn}()`);
    return res.rows[0][isCompleteFn];
  });

  // if there is no online-migration function, there's nothing to do
  if (!hooks['runBatch'] && !await fnExists({ client, name: batchFn })) {
    return;
  }

  // outer loop: continue until completion function returns true
  let outerCount = 0;
  while (true) {
    showProgress(`..checking completion of online ${kind} for db version ${versionNum}`);
    if (await isComplete()) {
      showProgress(`..complete`);
      return;
    }

    // inner loop: run batches

    let state = {};
    let count = 0;
    const eta = new ETA({ historyLength: 500 });
    let nextReport = 0;
    let reportTime = 1000; // start at once per second
    let batchSize = 1; // start small
    const batchTime = 1000; // desired time per batch (ms)

    eta.measurement(0);
    while (true) {
      if (hooks['preBatch']) {
        await hooks['preBatch'](outerCount, count);
      }
      const res = await runBatch(batchSize, state);
      state = res.state;
      count += res.count;
      eta.measurement(count);

      if (res.count === 0) {
        // batch found nothing to do, so check if we are finished
        break;
      }

      // update the batch size to try to get to batchTime (but minimum of one)
      const rate = eta.rate();
      if (!isNaN(rate)) {
        batchSize = Math.round(Math.max(1, rate * batchTime));
      }
      if (hooks['batchSize']) {
        batchSize = await hooks['batchSize'](batchSize);
      }

      if (nextReport <= Date.now()) {
        const roundedRate = Math.round(rate * 10000) / 10;
        showProgress(`   ${count} items complete at ${roundedRate}/s`);
        nextReport = Date.now() + reportTime;
        // slow down reporting up to once per minute
        reportTime = Math.min(reportTime * 2, 60 * 1000);
      }
    }
    outerCount++;
  }
};

runOnlineBatches.setHook = (hook, fn) => {
  hooks[hook] = fn;
};

runOnlineBatches.resetHooks = () => {
  hooks = {};
};

const runOnlineMigration = async ({ client, showProgress, versionNum }) => {
  await runOnlineBatches({
    client,
    showProgress,
    versionNum,
    kind: 'migration',
  });
};

const runOnlineDowngrade = async ({ client, showProgress, versionNum }) => {
  await runOnlineBatches({
    client,
    showProgress,
    versionNum,
    kind: 'downgrade',
  });
};

module.exports = {
  runMigration,
  runDowngrade,
  runOnlineMigration,
  runOnlineDowngrade,
  runOnlineBatches,
  dropOnlineFns,
};
