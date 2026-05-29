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

  return function({ config, payload, schema, now }) {
    const version = config.version;

    const errors = validate(config, schema[version]);
    if (errors) {
      throw new Error(errors);
    }

    // Extract hooks before deleting version and other metadata fields
    const hooks = config.hooks;

    // Delete fields that aren't part of task graph
    delete config.version;
    delete config.hooks;

    const tcyaml = TcYaml.instantiate(version);

    // Perform parameter substitutions. This happens after verification
    // because templating may change with schema version, and parameter
    // functions are used as default values for some fields.
    config = tcyaml.substituteParameters(config, cfg, payload);

    // Compile individual tasks, filtering any that are not intended
    // for the current github event type. Append taskGroupId while
    // we're at it.
    const result = tcyaml.compileTasks(config, cfg, payload, now);

    // Attach hooks to the result (no rendering, just pass through)
    if (hooks !== undefined && hooks.length > 0) {
      result.hooks = hooks;
    }

    return result;
  };
};

export default { setup };
