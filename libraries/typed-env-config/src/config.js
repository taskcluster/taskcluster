let _ = require('lodash');
let yaml = require('js-yaml');
let fs = require('fs');
let debug = require('debug')('taskcluster-lib-config');
let assert = require('assert');

/**
 * Load configuration from files and environment variables.
 *
 * options:
 * ```js
 * {
 *   files: [               // Files to load configuration from
 *     'config.yml',        // Defaults are relative to process.cwd
 *     'user-config.yml'
 *   ]
 *   profile:  undefined,   // Profile to apply
 *   env:      process.env  // Environment variables (mapping string to strings)
 * }
 * ```
 *
 * Configuration Format:
 * ```yaml
 * Defaults:
 *   hostname:     localhost
 *   port:         8080
 * Profiles:
 *   production:
 *     hostname:   example.com
 *     port:       !env:number PORT
 * ```
 *
 * The following special YAML types can be used to load from environment
 * variables:
 * ```
 * !env        <NAME>  Load string from env var <NAME>
 * !env:string <NAME>  Load string from env var <NAME>
 * !env:number <NAME>  Load number from env var <NAME>
 * !env:flag   <NAME>  Load true if env var <NAME> is defined
 * !env:bool   <NAME>  Load boolean as /true/i or /false/i from env var <NAME>
 * !env:json   <NAME>  Load JSON object from env var <NAME>
 * !env:list   <NAME>  Load list of space separated strings from env var <NAME>
 * ```
 *
 * If the environment variable in question isn't defined, the value will be
 * `undefined`, so it can fall-back to defaults from previous config file.
 */
let config = (options) => {
  options = _.defaults({}, options, {
    files: [
      'config.yml',
      'user-config.yml'
    ],
    profile:  undefined,
    env:      process.env
  });
  assert(options.files instanceof Array, "Expected an array of files");
  assert(typeof(options.env) === 'object', "Expected env to be an object");

  // Create a YAML type that loads from environment variable
  let createType = (name, typeName, deserialize) => {
    // Create new YAML type
    return new yaml.Type(name, {
      // Takes a string as input
      kind: 'scalar',
      // Accepts any string on the form [A-Z0-9_]+
      resolve(data) {
        return typeof(data) === 'string' && /^[A-Z0-9_]+$/.test(data);
      },
      // Deserialize the data, in the case we read the environment variable
      construct(data) {
        let value = options.env[data];
        try {
          return deserialize(value);
        } catch (err) {
          // Print a warning, if the environment variable is present
          if (value !== undefined) {
            console.log("base.config: Warning failed to load %s from " +
                        "environment variable '%s'", typeName, data);
          }
          return undefined;
        }
      }
    });
  };

  // Construct YAML schema
  const YAML_SCHEMA = yaml.Schema.create(yaml.JSON_SCHEMA, [
    createType('!env', 'string', val => {
      assert(typeof(val) === 'string');
      return val;
    }),
    createType('!env:string', 'string', val => {
      assert(typeof(val) === 'string');
      return val;
    }),
    createType('!env:number', 'string', val => {
      assert(typeof(val) === 'string');
      return parseFloat(val);
    }),
    createType('!env:flag', 'string', val => {
      return typeof(val) === 'string';
    }),
    createType('!env:bool', 'string', val => {
      assert(typeof(val) === 'string');
      if (/^true$/i.test(val)) {
        return true;
      }
      if (/^false$/i.test(val)) {
        return false;
      }
      return undefined;
    }),
    createType('!env:json', 'string', val => {
      assert(typeof(val) === 'string');
      return JSON.parse(val);
    }),
    createType('!env:list', 'string', val => {
      assert(typeof(val) === 'string');
      return (val.match(/'[^']*'|"[^"]*"|[^ \t]+/g) || []).map(entry =>{
        let n = entry.length;
        if ((entry[0] === "'" && entry[n - 1] === "'") ||
            (entry[0] === '"' && entry[n - 1] === '"')) {
          return entry.substring(1, n - 1);
        }
        return entry;
      });
    })
  ]);

  // Load files and parse YAML files
  let cfgs = [];
  for (let file of options.files) {
    let data;

    // Load data from file
    try {
      data = fs.readFileSync(file, {encoding: 'utf-8'});
    } catch (err) {
      // Don't print error, if the file is just missing
      if (err.code !== 'ENOENT') {
        debug("Failed to load: %s, err: %s", file, err, err.stack);
      } else {
        debug("Config file missing: %s", file);
      }
      continue;
    }

    // Load YAML from data
    try {
      data = yaml.safeLoad(data, {
        filename: file,
        schema: YAML_SCHEMA
      });
    } catch (err) {
      debug("Failed to parse YAML from %s, err: %s",
            file, err.toString(), err.stack);
      throw new Error("Can't parse YAML from: " + file + " " + err.toString());
    }
    // Add defaults to list of configurations if present
    if (data.Defaults) {
      assert(typeof(data.Defaults) === 'object',
             "'Defaults' must be an object");
      cfgs.unshift(data.Defaults);
    }

    // Add profile to list of configurations, if it is given
    if (data.Profiles && options.profile && data.Profiles[options.profile]) {
      let profile = data.Profiles[options.profile];
      assert(typeof(profile) === 'object', "profile must be an object");
      cfgs.unshift(profile);
    }
  }

  // Combine all the configuration keys
  return _.defaultsDeep.apply(_, cfgs);
};

// Export config
module.exports = config;
