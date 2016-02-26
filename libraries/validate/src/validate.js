let debug = require('debug')('taskcluster-lib-validate')
let _ = require('lodash');
let fs = require('fs');
let path = require('path');
let walk = require('walk')
let yaml = require('js-yaml');
let urljoin = require('url-join');
let assert = require('assert');
let Ajv = require('ajv');
let AWS = require('aws-sdk');
let Promise = require('promise');

function publishSchema(s3, bucket, prefix, name, content) {
  return new Promise((accept, reject) => {
    debug('Publishing schema %s', name);
    content = JSON.stringify(content, undefined, 4);
    if (!content) {
      debug("Schema %s has invalid content!", name);
      reject();
    }
    s3.putObject({
      Bucket: bucket,
      Key: prefix + name,
      Body: content,
      ContentType: 'application/json'
    }, (err, data) => {
      if (err) {
        debug('Publishing failed for schema %s', name);
        reject(err);
      }
      else {
        debug('Publishing succeeded for schema %s', name);
        accept(data)
      }
    });
  });
}

/** Render {$const: <key>} into JSON schema */
function render (schema, constants) {
  // Replace val with constant, if it is an {$const: <key>} schema
  var substitute = function(val) {
    // Primitives and arrays shouldn't event be considered
    if (!(val instanceof Object) || val instanceof Array) {
      return undefined;
    }

    // Check if there is a key and only one key
    var key = val['$const'];
    if (key === undefined || typeof(key) != 'string' || _.keys(val).length != 1) {
      return undefined;
    }

    // Check that there's a constant for the key
    var constant = constants[key];
    if (constant === undefined) {
      return undefined;
    }

    // Clone constant
    return _.cloneDeepWith(constants[key], substitute);
  };
  // Do a deep clone with substitute
  return _.cloneDeepWith(schema, substitute);
};

async function validator(options) {

  let cfg = _.defaults(options, {
    constants: './schemas/contants.yml',
    folder: './schemas',
    publish: process.env.NODE_ENV == 'production',
    baseUrl: 'http://schema.taskcluster.net/',
    bucket: 'schemas.taskcluster.net',
  });

  if (_.isString(cfg.constants)) {
    let fullpath = path.resolve(cfg.constants);
    debug('Attempting to set constants by file: %s', fullpath);
    try {
      cfg.constants = yaml.safeLoad(fs.readFileSync(fullpath, 'utf-8'));
    }
    catch (err) {
      if (err.code == 'ENOENT') {
        debug('Constants file does not exist, setting constants to {}');
        cfg.constants = {};
      } else {
        throw err;
      }
    }
  }

  let promises = [];
  let schemas = [];
  let ajv = Ajv();

  function addSchema (root, name) {
    let json = null;
    let data = fs.readFileSync(path.resolve(root, name), 'utf-8');
    if (/\.ya?ml$/.test(name)) {
      json = yaml.safeLoad(data);
    } else {
      json = JSON.parse(data);
    }

    let schema = render(json, cfg.constants);

    name = name.replace(/\.ya?ml$/, '.json');
    let id = urljoin(cfg.baseurl, cfg.prefix, name) + '#';
    if (!schema.id) {
      schema.id = id;
    }
    if (schema.id !== id) {
      debug("Bad schema name: %s expected: %s", schema.id, id);
      throw new Error('Incorrect schemaId specified. It is recommended not to set' +
          'one at all. It will be set automatically.');
    }

    try {
      ajv.addSchema(schema);
      debug('Loaded schema with id of "%s"', schema.id);
      schemas.push({name: name, schema: schema});
    } catch(err) {
      console.log(err);
      debug('failed to load schema at %s', path.resolve(root,name));
      throw err;
    }
  }

  function finishSchemaLoading() {
   debug("finished walking tree of schemas");
   if (cfg.publish) {
     debug('Publishing schemas');
     assert(cfg.aws, "Can't publish without aws credentials.");
     assert(cfg.prefix, "Can't publish without prefix");
     assert(cfg.prefix == "" || /.+\/$/.test(cfg.prefix),
       "prefix must be empty or should end with a slash");
     let s3Provider = null;
     if (cfg.s3Provider) {
       debug('Using user-provided s3 client');
       s3Provider = cfg.s3Provider;
     }
     else {
       debug('Using default s3 client');
       s3Provider = new AWS.S3(cfg.aws);
     }
     promises = promises.concat(
       schemas.map( (entry) => {
         return publishSchema(
           s3Provider,
           cfg.bucket,
           cfg.prefix,
           entry.name,
           entry.schema
         );
       })
     );
   }
  }

  let walkOptions = {
    listeners: {
      name: addSchema,
      end: finishSchemaLoading,
    }
  }

  let walker = walk.walkSync(path.resolve(cfg.folder), walkOptions);
  await Promise.all(promises);
  return ajv.validate;
};

module.exports = validator;
