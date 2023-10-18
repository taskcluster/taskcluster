import TcYaml from './tc-yaml.js';

/**
 * Returns a function that merges an existing taskcluster github config with
 * a pull request message's payload to generate a full task graph config.
 *  params {
 *    config:             '...', A yaml string
 *    payload:            {},    GitHub WebHook message payload
 *    schema:             url,   Url to the taskcluster config schema
 *  }
 **/
export const setup = async function({ cfg, schemaset }) {
  const validate = await schemaset.validator(cfg.taskcluster.rootUrl);

  return function({ config, payload, schema }) {
    const version = config.version;

    const errors = validate(config, schema[version]);
    if (errors) {
      throw new Error(errors);
    }
    //
    // We need to toss out the config version number; it's the only
    // field that's not also in graph/task definitions
    delete config.version;

    const tcyaml = TcYaml.instantiate(version);

    // Perform parameter substitutions. This happens after verification
    // because templating may change with schema version, and parameter
    // functions are used as default values for some fields.
    config = tcyaml.substituteParameters(config, cfg, payload);

    // Compile individual tasks, filtering any that are not intended
    // for the current github event type. Append taskGroupId while
    // we're at it.
    return tcyaml.compileTasks(config, cfg, payload, new Date().toJSON());
  };
};

export default { setup };
