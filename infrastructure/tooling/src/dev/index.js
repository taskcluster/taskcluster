const util = require('util');
const chalk = require('chalk');
const path = require('path');
const _ = require('lodash');
const { readRepoYAML, writeRepoYAML } = require('../utils');
const inquirer = require('inquirer');
const commonPrompts = require('./common');
const { rabbitPrompts, rabbitResources } = require('./rabbit');
const { azurePrompts, azureResources } = require('./azure');
const { postgresPrompts, postgresResources } = require('./postgres');
const { k8sResources } = require('./k8s');
const awsResources = require('./aws');
const taskclusterResources = require('./taskcluster');
const helm = require('./helm');
const { makePgUrl } = require('./util');
const { upgrade, downgrade } = require('taskcluster-db');

const USER_CONF_FILE = 'dev-config.yml';
const readUserConfig = async () => {
  let userConfig = {};
  try {
    userConfig = await readRepoYAML(USER_CONF_FILE);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  return userConfig;
};

const init = async (options) => {
  let configTmpl = await readRepoYAML(path.join('dev-docs', 'dev-config-example.yml'));
  let userConfig = await readUserConfig();

  const prompts = [];

  await commonPrompts({ userConfig, prompts, configTmpl });
  await rabbitPrompts({ userConfig, prompts, configTmpl });
  await postgresPrompts({ userConfig, prompts, configTmpl });
  await azurePrompts({ userConfig, prompts, configTmpl });

  let answer = await inquirer.prompt(prompts);

  userConfig = await awsResources({ userConfig, answer, configTmpl });
  userConfig = await taskclusterResources({ userConfig, answer, configTmpl });
  userConfig = await azureResources({ userConfig, answer, configTmpl });
  userConfig = await postgresResources({ userConfig, answer, configTmpl });
  userConfig = await rabbitResources({ userConfig, answer, configTmpl });
  userConfig = await k8sResources({ userConfig, answer, configTmpl });

  await writeRepoYAML(USER_CONF_FILE, _.merge(userConfig, answer));
};

const dbParams = (meta) => {
  return {
    adminDbUrl: makePgUrl({
      hostname: meta.dbPublicIp,
      username: meta.dbAdminUsername,
      password: meta.dbAdminPassword,
      dbname: meta.dbName,
    }),
    usernamePrefix: meta.dbAdminUsername,
  };
};

const dbUpgrade = async (options) => {
  const userConfig = await readUserConfig();
  const meta = userConfig.meta || {};

  const { dbVersion } = options;
  const toVersion = dbVersion ? parseInt(dbVersion) : undefined;

  const { adminDbUrl, usernamePrefix } = dbParams(meta);
  const showProgress = message => {
    util.log(chalk.green(message));
  };

  await upgrade({ showProgress, adminDbUrl, usernamePrefix, toVersion });
};

const dbDowngrade = async (options) => {
  const userConfig = await readUserConfig();
  const meta = userConfig.meta || {};

  const { dbVersion } = options;
  const toVersion = parseInt(dbVersion);
  if (!dbVersion.match(/^[0-9]+$/) || isNaN(toVersion)) {
    throw new Error('Missing or invalid --db-version');
  }

  const { adminDbUrl, usernamePrefix } = dbParams(meta);
  const showProgress = message => {
    util.log(chalk.green(message));
  };

  await downgrade({ showProgress, adminDbUrl, usernamePrefix, toVersion });
};

const apply = async (options) => {
  await helm('apply');
};

const verify = async (options) => {
  await helm('verify');
};

const delete_ = async (options) => {
  await helm('delete');
};

module.exports = { init, apply, verify, delete_, dbUpgrade, dbDowngrade };
