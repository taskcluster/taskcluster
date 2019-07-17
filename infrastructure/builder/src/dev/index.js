const _ = require('lodash');
const {readRepoYAML, writeRepoYAML} = require('../utils');
const inquirer = require('inquirer');
const commonPrompts = require('./common');
const rabbitPrompts = require('./rabbit');
const awsResources = require('./aws');
const taskclusterResources = require('./taskcluster');

const USER_CONF_FILE = 'user-config.yaml';

const main = async (options) => {
  let configTmpl = await readRepoYAML('user-config-example.yaml');
  let userConfig = {};
  try {
    userConfig = await readRepoYAML(USER_CONF_FILE);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
  const {hasSetup} = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'hasSetup',
      message: 'You\'ll need to have set up all credentials described in the dev-docs. Have you done so?',
      default: true,
    },
  ]);

  if (!hasSetup) {
    console.log('Exiting. Please configure credentials and then try again.');
    process.exit(1);
  }

  const prompts = [];

  await commonPrompts({userConfig, prompts, configTmpl});
  await rabbitPrompts({userConfig, prompts, configTmpl});

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
  await writeRepoYAML(USER_CONF_FILE, _.merge(userConfig, answer));
};

module.exports = {main};
