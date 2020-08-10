const stringify = require('json-stable-stringify');
const { writeRepoFile } = require('../../utils');

exports.tasks = [{
  title: 'Generate Taskcluster-Client',
  requires: ['apis'],
  provides: ['target-taskcluster-client'],
  run: async (requirements, utils) => {
    const apis = requirements['apis'];

    await writeRepoFile('clients/client/src/apis.js',
      '/* eslint-disable */\nmodule.exports = ' + stringify(apis, { space: 2 }) + ';');
  },
}];
