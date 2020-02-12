const path = require('path');
const _ = require('lodash');
const {readRepoYAML, writeRepoYAML} = require('../utils');
const inquirer = require('inquirer');
const commonPrompts = require('./common');
const {rabbitPrompts, rabbitResources} = require('./rabbit');
const {azurePrompts, azureResources} = require('./azure');
const awsResources = require('./aws');
const taskclusterResources = require('./taskcluster');
const helm = require('./helm');

const USER_CONF_FILE = 'dev-config.yml';

const main = async (options) => {

  if (options.init) {
    let configTmpl = await readRepoYAML(path.join('dev-docs', 'dev-config-example.yml'));
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

    let answer = await inquirer.prompt(prompts);

    userConfig = await awsResources({userConfig, answer, configTmpl});
    userConfig = await taskclusterResources({userConfig, answer, configTmpl});
    userConfig = await azureResources({userConfig, answer, configTmpl});
    userConfig = await rabbitResources({userConfig, answer, configTmpl});

    await writeRepoYAML(USER_CONF_FILE, _.merge(userConfig, answer));
  }

  if (options.k8sAction) {
    await helm(options.k8sAction);
  }
};

module.exports = {main};
