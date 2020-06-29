const {readRepoYAML} = require('../../utils');

exports.tasks = [];

exports.tasks.push({
  title: `Generate Docker-Worker Schema`,
  requires: [],
  provides: [
    'docker-worker-schemas',
  ],
  run: async (requirements, utils) => {
    const schemaFile = 'workers/docker-worker/schemas/v1/payload.yml';
    const content = await readRepoYAML(schemaFile);

    const schemas = [{
      filename: 'schemas/docker-worker/v1/payload.yml',
      content,
    }];

    return {
      'docker-worker-schemas': schemas,
    };
  },
});
