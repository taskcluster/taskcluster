const assert = require('assert').strict;
const { dollarQuote } = require('./util');

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

const runMigration = async ({ client, version, showProgress, usernamePrefix }) => {
  await client.query('begin');

  try {
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

    showProgress('..committing transaction');
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  }
};

const runDowngrade = async ({ client, schema, fromVersion, toVersion, showProgress, usernamePrefix }) => {
  assert.equal(fromVersion.version, toVersion.version + 1);
  await client.query('begin');

  try {
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

    showProgress('..committing transaction');
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  }
};

module.exports = {
  runMigration,
  runDowngrade,
};
