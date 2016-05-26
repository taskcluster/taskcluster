let debug = require('debug')('taskcluster-lib-validate');
let _ = require('lodash');
let fs = require('fs');
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
  let schemas = [];
  let ajv = Ajv({useDefaults: true, format: 'full', verbose: true, allErrors: true});

  let cfg = _.defaults(options, {
    constants: rootdir.get() + '/schemas/constants.yml',
    folder: rootdir.get() + '/schemas',
    publish: process.env.NODE_ENV == 'production',
    baseUrl: 'http://schemas.taskcluster.net/',
    bucket: 'schemas.taskcluster.net',
  });

  if (_.isString(cfg.constants)) {
    let fullpath = path.resolve(cfg.constants);
    debug('Attempting to set constants by file: %s', fullpath);
    try {
      cfg.constants = yaml.safeLoad(fs.readFileSync(fullpath, 'utf-8'));
    } catch (err) {
      if (err.code == 'ENOENT') {
        console.log('Constants file does not exist, setting constants to {}');
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

    name = name.replace(/\.ya?ml$/, '.json');
    let id = urljoin(cfg.baseUrl, cfg.prefix, name) + '#';
    if (!schema.id) {
      schema.id = id;
    }
    if (schema.id !== id) {
      debug('Bad schema name: %s expected: %s', schema.id, id);
      throw new Error('Incorrect schemaId specified. It is recommended not to set' +
          'one at all. It will be set automatically.');
    }

    try {
      ajv.addSchema(schema);
      debug('Loaded schema with id of "%s"', schema.id);
      schemas.push({name: name, schema: schema});
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
    await Promise.all(schemas.map((entry) => {
      return publish(
        s3Provider,
        cfg.bucket,
        cfg.prefix,
        entry.name,
        entry.schema
      );
    }));
  }

  return (obj, id) => {
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
};

module.exports = validator;
