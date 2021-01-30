const References = require('taskcluster-lib-references');

// generate apis.js in the format the client tasks expect..
exports.tasks = [{
  title: 'APIs data structure',
  requires: ['references-json'],
  provides: ['apis'],
  run: async (requirements, utils) => {
    const refs = References.fromSerializable({ serializable: requirements['references-json'] });

    const apis = {};
    refs.references.forEach(({ filename, content }) => {
      const refSchema = refs.getSchema(content.$schema);

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
      apis[camelCaseName] = { referenceKind: refSchema.metadata.name, reference: content };
    });

    return { apis };
  },
}];
