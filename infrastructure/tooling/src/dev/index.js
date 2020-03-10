const path = require('path');
const _ = require('lodash');
const {readRepoYAML, writeRepoYAML} = require('../utils');
const inquirer = require('inquirer');
const commonPrompts = require('./common');
const {rabbitPrompts, rabbitResources} = require('./rabbit');
const {azurePrompts, azureResources} = require('./azure');
const {postgresPrompts, postgresResources} = require('./postgres');
const awsResources = require('./aws');
const taskclusterResources = require('./taskcluster');
const helm = require('./helm');
const {makePgUrl} = require('./util');

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

  await commonPrompts({userConfig, prompts, configTmpl});
  await rabbitPrompts({userConfig, prompts, configTmpl});
  await postgresPrompts({userConfig, prompts, configTmpl});
  await azurePrompts({userConfig, prompts, configTmpl});

  let answer = await inquirer.prompt(prompts);

  userConfig = await awsResources({userConfig, answer, configTmpl});
  userConfig = await taskclusterResources({userConfig, answer, configTmpl});
  userConfig = await azureResources({userConfig, answer, configTmpl});
  userConfig = await postgresResources({userConfig, answer, configTmpl});
  userConfig = await rabbitResources({userConfig, answer, configTmpl});

  await writeRepoYAML(USER_CONF_FILE, _.merge(userConfig, answer));
};

const dbUpgrade = async (options) => {
  const userConfig = await readUserConfig();
  const meta = userConfig.meta || {};

  process.env.ADMIN_DB_URL = makePgUrl({
    hostname: meta.dbPublicIp,
    username: meta.dbAdminUsername,
    password: meta.dbAdminPassword,
    dbname: meta.dbName,
  });
  process.env.USERNAME_PREFIX = meta.dbAdminUsername;

  // invoke the main function for `yarn db:upgrade`
  await require('../../../../db/src/main')();
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

module.exports = {init, apply, verify, delete_, dbUpgrade};
