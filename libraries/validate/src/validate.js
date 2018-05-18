let debug = require('debug')('taskcluster-lib-validate');
let _ = require('lodash');
let fs = require('fs');
let rimraf = require('rimraf');
let path = require('path');
let walk = require('walk');
let yaml = require('js-yaml');
let assert = require('assert');
let Ajv = require('ajv');
let aws = require('aws-sdk');
let libUrls = require('taskcluster-lib-urls');
let Promise = require('promise');
let publish = require('./publish');
let render = require('./render');
let rootdir = require('app-root-dir');
let mkdirp = require('mkdirp');

async function validator(options) {
  let schemas = {};
  let ajv = Ajv({useDefaults: true, format: 'full', verbose: true, allErrors: true});

  assert(!options.prefix, 'The `prefix` option is no longer allowed');
  assert(!options.version, 'The `version` option is no longer allowed');
  assert(options.rootUrl, 'A `rootUrl` must be provided to taskcluster-lib-validate!');
  assert(options.serviceName, 'A `serviceName` must be provided to taskcluster-lib-validate!');

  let defaultFolder = path.join(rootdir.get(), 'schemas');
  let cfg = _.defaults(options, {
    folder: defaultFolder,
    constants: path.join(options && options.folder || defaultFolder, 'constants.yml'),
    publish: process.env.NODE_ENV == 'production',
    bucket: 'schemas.taskcluster.net',
    preview: process.env.PREVIEW_JSON_SCHEMA_FILES,
    writeFile: process.env.WRITE_JSON_SCHEMA_FILES,
  });

  if (_.isString(cfg.constants)) {
    let fullpath = path.resolve(cfg.constants);
    debug('Attempting to set constants by file: %s', fullpath);
    try {
      cfg.constants = yaml.safeLoad(fs.readFileSync(fullpath, 'utf-8'));
    } catch (err) {
      if (err.code == 'ENOENT') {
        debug('Constants file does not exist, setting constants to {}');
        cfg.constants = {};
      } else {
        throw err;
      }
    }
  }

  let walkErr;
  walk.walkSync(path.resolve(cfg.folder), {listeners: {file: (root, stats) => {
    try {
      let name = path.relative(cfg.folder, path.join(root, stats.name));

      let json = null;
      let data = fs.readFileSync(path.join(cfg.folder, name), 'utf-8');
      if (/\.ya?ml$/.test(name) && name !== 'constants.yml') {
        json = yaml.safeLoad(data);
      } else if (/\.json$/.test(name)) {
        json = JSON.parse(data);
      } else {
        debug('Ignoring file %s', name);
        return;
      }

      let schema = render(json, cfg.constants);

      if (schema.id) {
        debug('Schema incorrectly attempts to set own id: %s', name);
        throw new Error('Schema ' + path.join(root, name) + ' attempts to set own id!');
      }
      let jsonName = name.replace(/\.ya?ml$/, '.json');
      schema.id = libUrls.schema(cfg.rootUrl, cfg.serviceName, jsonName + '#');

      ajv.addSchema(schema);
      debug('Loaded schema with id of "%s"', schema.id);
      let content = JSON.stringify(schema, undefined, 4);
      if (!content) {
        throw new Error('Schema %s has invalid content!', name);
      }
      schemas[jsonName] = content;
    } catch (err) {
      // walk swallows errors, so we must raise them ourselves
      if (!walkErr) {
        walkErr = err;
      }
    }
  }}});
  if (walkErr) {
    throw walkErr;
  }
  debug('finished walking tree of schemas');

  if (cfg.publish) {
    debug('Publishing schemas');
    assert(cfg.aws, 'Can\'t publish without aws credentials.');
    let s3Provider = cfg.s3Provider;
    if (!s3Provider) {
      debug('Using default s3 client');
      s3Provider = new aws.S3(cfg.aws);
    }
    await Promise.all(_.map(schemas, (content, name) => {
      return publish.s3(
        s3Provider,
        cfg.bucket,
        `${cfg.serviceName}/`,
        name,
        content
      );
    }));
  }

  if (cfg.writeFile) {
    debug('Writing schema to local file');
    let dir = 'rendered_schemas';
    rimraf.sync(dir);
    _.forEach(schemas, (content, name) => {
      const file = path.join(dir, name);
      const subdir = path.dirname(file);
      mkdirp.sync(subdir);
      publish.writeFile(file, content);
    });
  }

  if (cfg.preview) {
    debug('Writing schema to console');
    await Promise.all(_.map(schemas, (content, name) => {
      return publish.preview(
        name,
        content
      );
    }));
  }

  let validate = (obj, id) => {
    id = id.replace(/#$/, '');
    id = id.replace(/\.ya?ml$/, '.json');
    if (!_.endsWith(id, '.json')) {
      id += '.json';
    }
    id += '#';
    ajv.validate(id, obj);
    if (ajv.errors) {
      _.forEach(ajv.errors, function(error) {
        if (error.params['additionalProperty']) {
          error.message += ': ' + JSON.stringify(error.params['additionalProperty']);
        }
      });
      return [
        '\nSchema Validation Failed!',
        '\nRejecting Schema: ',
        id,
        '\nErrors:\n  * ',
        ajv.errorsText(ajv.errors, {separator: '\n  * '}),
      ].join('');
    }
    return null;
  };

  // Add a utility property that can be used to get all of the
  // schemas that have been loaded.
  validate.schemas = schemas;

  return validate;
};

module.exports = validator;
