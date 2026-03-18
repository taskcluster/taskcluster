import path from 'node:path';
import { downgrade, upgrade } from '@taskcluster/db';
import chalk from 'chalk';
import inquirer from 'inquirer';
import _ from 'lodash';
import { readRepoYAML, writeRepoYAML } from '../utils/index.js';
import awsResources from './aws.js';

import { azureResources } from './azure.js';
import commonPrompts from './common.js';
import helm from './helm.js';
import { k8sResources } from './k8s.js';
import { postgresEnsureDb, postgresPrompts, postgresResources } from './postgres.js';
import { rabbitAdminPasswordPrompt, rabbitEnsureResources, rabbitPrompts, rabbitResources } from './rabbit.js';
import taskclusterResources from './taskcluster.js';
import { makePgUrl } from './util.js';

const USER_CONF_FILE = 'dev-config.yml';
export const readUserConfig = async () => {
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

export const init = async (_options) => {
  const configTmpl = await readRepoYAML(path.join('dev-docs', 'dev-config-example.yml'));
  let userConfig = await readUserConfig();

  const prompts = [];

  await commonPrompts({ userConfig, prompts, configTmpl });
  await rabbitPrompts({ userConfig, prompts, configTmpl });
  await postgresPrompts({ userConfig, prompts, configTmpl });

  const answer = await inquirer.prompt(prompts);

  userConfig = await awsResources({ userConfig, answer, configTmpl });
  userConfig = await taskclusterResources({ userConfig, answer, configTmpl });
  userConfig = await azureResources({ userConfig, answer, configTmpl });
  userConfig = await postgresResources({ userConfig, answer, configTmpl });
  userConfig = await rabbitResources({ userConfig, answer, configTmpl });
  userConfig = await k8sResources({ userConfig, answer, configTmpl });

  await writeRepoYAML(USER_CONF_FILE, _.merge(userConfig, answer));
};

export const dbParams = (meta) => {
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

export const dbUpgrade = async (options) => {
  const userConfig = await readUserConfig();
  const meta = userConfig.meta || {};

  const { dbVersion } = options;
  const toVersion = dbVersion ? parseInt(dbVersion, 10) : undefined;

  const { adminDbUrl, usernamePrefix } = dbParams(meta);
  const showProgress = (message) => {
    console.log(chalk.green(message));
  };

  await upgrade({ showProgress, adminDbUrl, usernamePrefix, toVersion });
};

export const dbDowngrade = async (options) => {
  const userConfig = await readUserConfig();
  const meta = userConfig.meta || {};

  const { dbVersion } = options;
  const toVersion = parseInt(dbVersion, 10);
  if (!dbVersion.match(/^[0-9]+$/) || Number.isNaN(toVersion)) {
    throw new Error('Missing or invalid --db-version');
  }

  const { adminDbUrl, usernamePrefix } = dbParams(meta);
  const showProgress = (message) => {
    console.log(chalk.green(message));
  };

  await downgrade({ showProgress, adminDbUrl, usernamePrefix, toVersion });
};

export const apply = async (_options) => {
  await helm('apply');
};

export const verify = async (_options) => {
  await helm('verify');
};

export const templates = async (_options) => {
  const templates = await helm('dump-templates');
  return templates;
};

export const ensureDb = async (_options) => {
  const userConfig = await readUserConfig();
  await postgresEnsureDb({ userConfig });
};

export const ensureRabbit = async (_options) => {
  const userConfig = await readUserConfig();
  const prompts = [];

  await rabbitAdminPasswordPrompt({ userConfig, prompts });
  const answer = await inquirer.prompt(prompts);

  await rabbitEnsureResources({ userConfig, answer });
};

export const delete_ = async (_options) => {
  await helm('delete');
};

export default {
  init,
  apply,
  verify,
  templates,
  ensureDb,
  ensureRabbit,
  delete_,
  dbUpgrade,
  dbDowngrade,
};
