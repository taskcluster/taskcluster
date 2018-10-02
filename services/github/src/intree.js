const debug = require('debug')('taskcluster-github:intree');
const yaml = require('js-yaml');
const TcYaml = require('./tc-yaml');

module.exports = {};

/**
 * Returns a function that merges an existing taskcluster github config with
 * a pull request message's payload to generate a full task graph config.
 *  params {
 *    config:             '...', A yaml string
 *    payload:            {},    GitHub WebHook message payload
 *    schema:             url,   Url to the taskcluster config schema
 *  }
 **/
module.exports.setup = async function({cfg, schemaset}) {
  const validate = await schemaset.validator(cfg.taskcluster.rootUrl);

  return function({config, payload, schema}) {
    config = yaml.safeLoad(config);
    const version = config.version;

    const errors = validate(config, schema[version]);
    if (errors) {
      throw new Error(errors);
    }
    debug(`intree config for ${payload.organization}/${payload.repository} matches valid schema.`);

    // We need to toss out the config version number; it's the only
    // field that's not also in graph/task definitions
    delete config.version;

    const tcyaml = TcYaml.instantiate(version);

    // Perform parameter substitutions. This happens after verification
    // because templating may change with schema version, and parameter
    // functions are used as default values for some fields.
    config = tcyaml.substituteParameters(config, cfg, payload);

    try {
      // Compile individual tasks, filtering any that are not intended
      // for the current github event type. Append taskGroupId while
      // we're at it.
      return tcyaml.compileTasks(config, cfg, payload, new Date().toJSON());
    } catch (e) {
      debug('Error processing tasks!');
      throw e;
    }
  };
};
