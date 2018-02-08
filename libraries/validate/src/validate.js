let debug = require('debug')('taskcluster-lib-validate');
let _ = require('lodash');
let fs = require('fs');
let rimraf = require('rimraf');
let path = require('path');
let walk = require('walk');
let yaml = require('js-yaml');
let urljoin = require('url-join');
let assert = require('assert');
let Ajv = require('ajv');
let aws = require('aws-sdk');
let Promise = require('promise');
let publish = require('./publish');
let render = require('./render');
let rootdir = require('app-root-dir');

async function validator(options) {
  let schemas = {};
  let ajv = Ajv({useDefaults: true, format: 'full', verbose: true, allErrors: true});

  let defaultFolder = path.join(rootdir.get(), 'schemas');
  let cfg = _.defaults(options, {
    folder: defaultFolder,
    constants: path.join(options && options.folder || defaultFolder, 'constants.yml'),
    publish: process.env.NODE_ENV == 'production',
    baseUrl: 'http://schemas.taskcluster.net/',
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

  walk.walkSync(path.resolve(cfg.folder), {listeners: {name: (root, name) => {
    let json = null;
    let data = fs.readFileSync(path.resolve(root, name), 'utf-8');
    if (/\.ya?ml$/.test(name) && name !== 'constants.yml') {
      json = yaml.safeLoad(data);
    } else if (/\.json$/.test(name)) {
      json = JSON.parse(data);
    } else {
      return;
    }

    let schema = render(json, cfg.constants);

    if (schema.id) {
      debug('Schema incorrectly attempts to set own id: %s', name);
      throw new Error('Schema ' + path.join(root, name) + ' attempts to set own id!');
    }
    name = name.replace(/\.ya?ml$/, '.json');
    schema.id = urljoin(cfg.baseUrl, cfg.prefix, name) + '#';

    try {
      ajv.addSchema(schema);
      debug('Loaded schema with id of "%s"', schema.id);
      let content = JSON.stringify(schema, undefined, 4);
      if (!content) {
        throw new Error('Schema %s has invalid content!', name);
      }
      schemas[name] = content;
    } catch (err) {
      debug('failed to load schema at %s', path.resolve(root, name));
      throw err;
    }
  }}});
  debug('finished walking tree of schemas');

  if (cfg.publish) {
    debug('Publishing schemas');
    assert(cfg.aws, 'Can\'t publish without aws credentials.');
    assert(cfg.prefix, 'Can\'t publish without prefix');
    assert(cfg.prefix == '' || /.+\/$/.test(cfg.prefix),
      'prefix must be empty or should end with a slash');
    let s3Provider = cfg.s3Provider;
    if (!s3Provider) {
      debug('Using default s3 client');
      s3Provider = new aws.S3(cfg.aws);
    }
    await Promise.all(_.map(schemas, (content, name) => {
      return publish.s3(
        s3Provider,
        cfg.bucket,
        cfg.prefix,
        name,
        content
      );
    }));
  }

  if (cfg.writeFile) {
    debug('Writing schema to local file');
    let dir = 'rendered_schemas';
    rimraf.sync(dir);
    fs.mkdirSync(dir);
    await Promise.all(_.map(schemas, (content, name) => {
      return publish.writeFile(
        name,
        content
      );
    }));
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

  // Add a utility function that can be used to get all of the
  // schemas that have been loaded.
  validate.schemas = schemas;

  return validate;
};

module.exports = validator;
