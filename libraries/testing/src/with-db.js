const path = require('path');
const assert = require('assert');
const {Client} = require('pg');
const {Schema, ignorePgErrors, UNDEFINED_OBJECT, UNDEFINED_TABLE} = require('taskcluster-lib-postgres');
const tcdb = require('taskcluster-db');
const {URL} = require('url');

const testDbUrl = process.env.TEST_DB_URL;

const resetDb = async () => {
  const client = new Client({connectionString: testDbUrl});
  await client.connect();
  try {
    // completely reset the DB contents
    await client.query(`drop schema if exists public cascade`);
    await client.query(`create schema public`);

    // get the password portion of the testDbUrl, and use the same for each of
    // the service accounts.  In the common case of testing with Docker, this
    // is empty.
    const url = new URL(testDbUrl);
    const password = url.password;

    // get a list of services that have any access from the schema
    const schema = Schema.fromDbDirectory(path.join(__dirname, '../../../db'));

    // and reset/create a user for each one..
    for (let serviceName of schema.access.serviceNames()) {
      const serviceUsername = `test_${serviceName.replace(/-/g, '_')}`;
      await ignorePgErrors(client.query(`drop owned by ${serviceUsername}`), UNDEFINED_OBJECT);
      await ignorePgErrors(client.query(`drop user ${serviceUsername}`), UNDEFINED_OBJECT);
      if (password) {
        await client.query(`create user ${serviceUsername} PASSWORD '${password}'`);
      } else {
        await client.query(`create user ${serviceUsername}`);
      }
    }
  } finally {
    await client.end();
  }
};

const resetTables = async ({tableNames}) => {
  const client = new Client({connectionString: testDbUrl});
  await client.connect();
  try {
    for (let tableName of tableNames) {
      await ignorePgErrors(client.query(`truncate ${tableName}`), UNDEFINED_TABLE);
    }
  } finally {
    await client.end();
  }
};

/**
 * withDb:
 *
 * - set up helper.db as a Database, and upgrade that database to the most recent version.
 *
 * It's up to the caller to set up and clear any data between test cases.
 */
module.exports.withDb = (mock, skipping, helper, serviceName) => {
  assert(testDbUrl,
    "TEST_DB_URL must be set to run these tests - see dev-docs/development-process.md for more information");

  suiteSetup('withDb', async function() {
    if (skipping()) {
      return;
    }
    const dbCryptoKeys = [
      {
        id: 'azure',
        algo: 'aes-256',
        key: 'aSdtIGJzdGFjayEgaGVsbG8gZnV0dXJlIHBlcnNvbgo',
      },
    ];

    await resetDb();

    // upgrade..
    await tcdb.upgrade({
      adminDbUrl: testDbUrl,
      usernamePrefix: 'test',
      useDbDirectory: true,
    });

    let serviceDbUrl = new URL(testDbUrl);
    serviceDbUrl.username = `test_${serviceName.replace(/-/g, '_')}`;
    serviceDbUrl = serviceDbUrl.toString();

    helper.db = await tcdb.setup({
      readDbUrl: serviceDbUrl,
      writeDbUrl: serviceDbUrl,
      serviceName,
      useDbDirectory: true,
      monitor: false,
      dbCryptoKeys,
    });

    if (helper.load) {
      helper.load.inject('db', helper.db);
    }
  });

  suiteTeardown('withDb', async function() {
    if (skipping()) {
      return;
    }
    if (helper.db) {
      await helper.db.close();
    }
    delete helper.db;
  });
};

// this is useful for taskcluster-db's tests, as well
module.exports.resetDb = resetDb;
module.exports.resetTables = resetTables;
