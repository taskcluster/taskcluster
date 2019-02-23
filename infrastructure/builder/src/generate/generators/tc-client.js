const stringify = require('json-stable-stringify');
const {writeFile} = require('../util');

exports.tasks = [{
  title: 'Generate Taskcluster-Client',
  requires: ['apis'],
  provides: ['target-taskcluster-client'],
  run: async (requirements, utils) => {
    const apis = requirements['apis'];

    await writeFile('clients/client/src/apis.js',
      '/* eslint-disable */\nmodule.exports = ' + stringify(apis, {space: 2}) + ';');
  },
}];
