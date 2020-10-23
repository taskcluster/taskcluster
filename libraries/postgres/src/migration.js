const assert = require('assert').strict;
const { dollarQuote } = require('./util');

const runMigration = async ({ client, version, showProgress, usernamePrefix }) => {
  await client.query('begin');

  try {
    if (version.version === 1) {
      await client.query('create table if not exists tcversion as select 0 as version');
    }

    // check the version and lock it to prevent other things from changing it
    const res = await client.query('select version from tcversion for update');
    if (res.rowCount !== 1 || res.rows[0].version !== version.version - 1) {
      throw Error('Multiple DB upgrades running simultaneously');
    }
    if (version.migrationScript) {
      showProgress('..running migration script');
      const migrationScript = version.migrationScript
        .replace(/\$db_user_prefix\$/g, usernamePrefix);
      await client.query(`DO ${dollarQuote(migrationScript)}`);
    }
    showProgress('..defining methods');
    for (let [methodName, { args, body, returns, deprecated }] of Object.entries(version.methods)) {
      if (deprecated && !args && !returns && !body) {
        continue; // This allows just deprecating without changing a method
      }
      await client.query(`create or replace function
      "${methodName}"(${args})
      returns ${returns}
      as ${dollarQuote(body)}
      language plpgsql`);
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
    // check the version and lock it to prevent other things from changing it
    const res = await client.query('select version from tcversion for update');
    if (res.rowCount !== 1 || res.rows[0].version !== fromVersion.version) {
      throw Error('Multiple DB modifications running simultaneously');
    }
    if (fromVersion.downgradeScript) {
      showProgress('..running downgrade script');
      const downgradeScript = fromVersion.downgradeScript
        .replace(/\$db_user_prefix\$/g, usernamePrefix);
      await client.query(`DO ${dollarQuote(downgradeScript)}`);
    }

    // either find the most recent definition of each function,
    // or drop the function if it was not defined before fromVersion
    showProgress('..redefining methods');
    for (let [methodName, { args }] of Object.entries(fromVersion.methods)) {
      let foundMethod = false;
      for (let ver = toVersion.version; ver > 0; ver--) {
        const version = schema.getVersion(ver);
        if (methodName in version.methods) {
          const { args, body, returns } = version.methods[methodName];
          showProgress(`   using ${methodName} from db version ${version.version}`);
          await client.query(`create or replace function
            "${methodName}"(${args})
            returns ${returns}
            as ${dollarQuote(body)}
            language plpgsql`);
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
