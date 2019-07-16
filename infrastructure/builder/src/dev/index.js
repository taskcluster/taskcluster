const _ = require('lodash');
const {readRepoYAML, writeRepoYAML} = require('../utils');
const inquirer = require('inquirer');
const commonPrompts = require('./common');
const rabbitPrompts = require('./rabbit');
//const awsPrompts = require('./aws');

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
  const prompts = [];

  await commonPrompts({userConfig, prompts, configTmpl});
  await rabbitPrompts({userConfig, prompts, configTmpl});
  //await awsPrompts({userConfig, prompts, configTmpl});

  let {meta, ...answer} = await inquirer.prompt(prompts);
  let rabbitUsers = {};
  if (meta) {
    rabbitUsers = meta.rabbitAdminPassword;
    delete meta.rabbitAdminPassword;
  } else {
    meta = {};
  }
  answer = _.merge(answer, rabbitUsers, {meta});
  await writeRepoYAML(USER_CONF_FILE, _.merge(configTmpl, userConfig, answer));
};

module.exports = {main};
