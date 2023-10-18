import _ from 'lodash';
import path from 'path';
import yaml from 'js-yaml';
import fs from 'fs';
import debugFactory from 'debug';
const debug = debugFactory('taskcluster-lib-config');
import assert from 'assert';
import buildSchema from './schema.js';

const __dirname = new URL('.', import.meta.url).pathname;

const REPO_ROOT = path.join(__dirname, '../../../');

const config = ({
  profile = process.env.NODE_ENV,
  env = process.env,
  files = [
    { path: 'config.yml', required: true },
    { path: 'user-config.yml', required: false },
  ],
  serviceName,
  getEnvVars = false,
}) => {
  assert(files instanceof Array, 'Expected an array of files');
  assert(typeof env === 'object', 'Expected env to be an object');
  assert(serviceName, 'serviceName is required');

  const envVars = getEnvVars ? [] : null; // This will store the list of possible env vars

  const schema = buildSchema(env, envVars);

  // look for files in this service's directory
  const baseDir = path.join(REPO_ROOT, 'services', serviceName);

  const cfgs = [];
  for (const file of files) {
    assert(file.path, 'Config files must be of the form {path: "...", required: true|false}');
    assert(file.required !== undefined, 'Config files must be of the form {path: "...", required: true|false}');
    let f;
    try {
      f = fs.readFileSync(path.resolve(baseDir, file.path), { encoding: 'utf-8' });
    } catch (err) {
      if (err.code !== 'ENOENT' || file.required) {
        throw err;
      }
      debug(`Skipping missing config file: ${file.path}`);
      continue;
    }

    const data = yaml.load(f, {
      filename: file.path, // This just gets included in error messages
      schema,
    });

    // If the user requested environment variables list, return it and stop
    if (envVars) {
      return envVars;
    }

    // Add defaults to list of configurations if present
    if (data.defaults) {
      assert(typeof data.defaults === 'object',
        '\'defaults\' must be an object');
      cfgs.unshift(data.defaults);
    }

    // Add profile to list of configurations, if it is given
    if (profile && data[profile]) {
      let prof = data[profile];
      assert(typeof prof === 'object', 'profile must be an object');
      cfgs.unshift(prof);
    }
  }

  if (cfgs.length === 0) {
    throw new Error('Must load at least one configuration file!');
  }

  // Combine all the configuration keys
  return _.defaultsDeep.apply(_, cfgs);
};

// Export config
export default config;
