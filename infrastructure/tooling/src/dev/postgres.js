const slugid = require('slugid');
const crypto = require('crypto');
const { Client } = require('pg');
const { makePgUrl } = require('./util');

const postgresPrompts = ({ userConfig, prompts, configTmpl }) => {
  prompts.push({
    when: () => !userConfig.meta.dbPublicIp,
    type: 'input',
    name: 'meta.dbPublicIp',
    message: 'What is the public IP of your Postgres server? (used for this script and for running db:upgrade)',
  });

  prompts.push({
    when: () => !userConfig.meta.dbPrivateIp,
    type: 'input',
    name: 'meta.dbPrivateIp',
    default: previous => (previous.meta || {}).dbPublicIp || (userConfig.meta || {}).dbPublicIp,
    message: 'What is the private IP of your Postgres server? (used for access from services, use the public IP if you have not set up private IP access)',
  });

  prompts.push({
    when: () => !userConfig.meta.dbName,
    type: 'input',
    name: 'meta.dbName',
    default: previous => (previous.meta || {}).deploymentPrefix || (userConfig.meta || {}).deploymentPrefix,
    message: 'What is the name of the Postgres database on the given server?',
    validate: dbName => {
      if (!/^[a-z0-9]+$/.test(dbName)) {
        return 'Must consist of lowercase characters and numbers';
      }
      return true;
    },
  });

  prompts.push({
    when: () => !userConfig.meta.dbAdminUsername,
    type: 'input',
    name: 'meta.dbAdminUsername',
    default: previous => (previous.meta || {}).deploymentPrefix || (userConfig.meta || {}).deploymentPrefix,
    message: 'What is the username of the admin Postgres user (and also prefix for per-service usernames)?',
    validate: dbAdminUsername => {
      if (!/^[a-z0-9]+$/.test(dbAdminUsername)) {
        return 'Must consist of lowercase characters and numbers';
      }
      return true;
    },
  });

  prompts.push({
    when: () => !userConfig.meta.dbAdminPassword,
    type: 'password',
    name: 'meta.dbAdminPassword',
    message: 'What is the password of the admin Postgres user (note: this will be stored in your dev config)?',
  });
};

const postgresResources = async ({ userConfig, answer, configTmpl }) => {
  let servicesNeedingUrls = [];
  for (const [name, cfg] of Object.entries(configTmpl)) {
    if (!userConfig[name]) {
      userConfig[name] = {};
    }

    // set up crypto keys, including migrating from azure_{crypto,signing}_key

    if (cfg.db_crypto_keys !== undefined) {
      if (!userConfig[name].db_crypto_keys) {
        userConfig[name].db_crypto_keys = [{
          id: 'dev-init',
          algo: 'aes-256',
          key: crypto.randomBytes(32).toString('base64'),
        }];
      }

      if (userConfig[name].azure_crypto_key) {
        userConfig[name].db_crypto_keys.unshift({
          id: 'azure',
          algo: 'aes-256',
          key: userConfig[name].azure_crypto_key,
        });
        delete userConfig[name].azure_crypto_key;
      }
    } else {
      // this service doesn't use encrypted columns..
      delete userConfig[name].azure_crypto_key;
    }

    // signing is no longer supported in any service
    delete userConfig[name].azure_signing_key;

    // check for the *_db_url parameters

    if (cfg.read_db_url !== undefined && !userConfig[name].read_db_url) {
      servicesNeedingUrls.push(name);
    } else if (cfg.write_db_url !== undefined && !userConfig[name].write_db_url) {
      servicesNeedingUrls.push(name);
    }
  }

  // if all services are set up, there's nothing to do..
  if (servicesNeedingUrls.length === 0) {
    return userConfig;
  }

  const { dbAdminUsername, dbAdminPassword, dbName, dbPublicIp, dbPrivateIp } =
    Object.assign({}, userConfig.meta || {}, answer.meta || {});

  const client = new Client({
    host: dbPublicIp,
    user: dbAdminUsername,
    password: dbAdminPassword,
    database: dbName,
    // Cloud SQL servers support TLS but not cert validation, so don't
    // try to validate it.
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    for (let serviceName of servicesNeedingUrls) {
      const username = `${dbAdminUsername}_${serviceName}`;
      const password = `${slugid.v4()}${slugid.v4()}`;
      const url = makePgUrl({
        hostname: dbPrivateIp,
        username, password,
        dbname: dbName,
      });
      console.log(`Creating DB user ${username}`);
      // this is all user-generated content without `'`, so including it literally
      // in the SQL is OK
      await client.query(`create user ${username} password '${password}'`);
      userConfig[serviceName].read_db_url = url;
      userConfig[serviceName].write_db_url = url;
    }
  } finally {
    await client.end();
  }

  return userConfig;
};

module.exports = {
  postgresPrompts,
  postgresResources,
};
