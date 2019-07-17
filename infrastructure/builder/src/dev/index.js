const path = require('path');
const _ = require('lodash');
const {readRepoYAML, writeRepoYAML} = require('../utils');
const inquirer = require('inquirer');
const commonPrompts = require('./common');
const rabbitPrompts = require('./rabbit');
const {azurePrompts, azureResources} = require('./azure');
const awsResources = require('./aws');
const taskclusterResources = require('./taskcluster');

const USER_CONF_FILE = 'user-config.yml';

const main = async (options) => {
  let configTmpl = await readRepoYAML(path.join('dev-docs', 'user-config-example.yml'));
  let userConfig = {};
  try {
    userConfig = await readRepoYAML(USER_CONF_FILE);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  const prompts = [];

  await commonPrompts({userConfig, prompts, configTmpl});
  await rabbitPrompts({userConfig, prompts, configTmpl});
  await azurePrompts({userConfig, prompts, configTmpl});

  let {meta, ...answer} = await inquirer.prompt(prompts);
  let rabbitUsers = {};
  if (meta) {
    rabbitUsers = meta.rabbitAdminPassword;
    delete meta.rabbitAdminPassword;
  } else {
    meta = {};
  }
  answer = _.merge(answer, rabbitUsers, {meta});

  userConfig = await awsResources({userConfig, answer, configTmpl});
  userConfig = await taskclusterResources({userConfig, answer, configTmpl});
  userConfig = await azureResources({userConfig, answer, configTmpl});
  await writeRepoYAML(USER_CONF_FILE, _.merge(userConfig, answer));
};

module.exports = {main};
