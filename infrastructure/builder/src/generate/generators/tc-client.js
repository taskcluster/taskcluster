const stringify = require('json-stable-stringify');
const References = require('taskcluster-lib-references');
const {writeFile} = require('../util');

exports.tasks = [{
  title: 'Generate Taskcluster-Client',
  requires: ['references-json'],
  provides: ['target-taskcluster-client'],
  run: async (requirements, utils) => {
    const refs = References.fromSerializable({serializable: requirements['references-json']});

    // generate apis.js in the format the client expects..
    const apis = {};
    refs.references.forEach(({filename, content}) => {
      const refSchema = refs.getSchema(content.$schema);
      let name;

      if (refSchema.metadata.name !== 'api' && refSchema.metadata.name !== 'exchanges') {
        return; // ignore this reference
      }
      if (refSchema.metadata.version !== 0) {
        throw new Error(`Unknown reference version in ${filename}`);
      }

      // invent a CamelCase name
      const camelCaseName = content.serviceName
        .split('-')
        .concat(refSchema.metadata.name === 'exchanges' ? ['events'] : [])
        .map(w => `${w[0].toUpperCase()}${w.slice(1)}`)
        .join('');
      apis[camelCaseName] = {reference: content};
    });

    // include some deprecated services for which we want to (temporarily)
    // continue generating clients
    Object.assign(apis, require('./deprecated-services.json'));

    await writeFile('libraries/client/src/apis.js',
      '/* eslint-disable */\nmodule.exports = ' + stringify(apis, {space: 2}) + ';');
  },
}];
