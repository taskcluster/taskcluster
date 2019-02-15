const express = require('express');
const url = require('url');
const Debug = require('debug');
const aws = require('aws-sdk');
const assert = require('assert');
const _ = require('lodash');
const fs = require('fs');
const libUrls = require('taskcluster-lib-urls');
const taskcluster = require('taskcluster-client');
const {buildReportErrorMethod} = require('./middleware/errors');
const {callHandler} = require('./middleware/handle');
const {validateSchemas} = require('./middleware/schema');
const {queryValidator} = require('./middleware/queries');
const {parameterValidator} = require('./middleware/parameters');
const {remoteAuthentication} = require('./middleware/auth');
const {parseBody} = require('./middleware/parse');
const {expressError} = require('./middleware/express-error');

const debug = Debug('api');

/**
 * A service represents an instance of an API at a specific rootUrl, ready to
 * provide an Express router, references, etc.  It is constructed by APIBuilder.build().
 */
class API {
  constructor(options) {
    assert(!options.authBaseUrl, 'authBaseUrl option is no longer allowed');
    assert(!options.baseUrl, 'baseUrl option is no longer allowed');
    assert(options.builder, 'builder option is required');
    assert(options.rootUrl, 'rootUrl option is required');
    assert(options.monitor, 'monitor option is required');
    assert(!options.referencePrefix, 'referencePrefix is now deprecated!');

    options = _.defaults({}, options, {
      inputLimit: '10mb',
      allowedCORSOrigin: '*',
      context: {},
      nonceManager: nonceManager(),
      referenceBucket: 'references.taskcluster.net',
      signatureValidator: createRemoteSignatureValidator({
        rootUrl: options.rootUrl,
      }),
      serviceName: options.builder.serviceName,
      apiVersion: options.builder.apiVersion,
    });
    this.builder = options.builder;

    // validate context
    this.builder.context.forEach((property) => {
      assert(options.context[property] !== undefined,
        'Context must have declared property: \'' + property + '\'');
    });

    Object.keys(options.context).forEach(property => {
      assert(this.builder.context.indexOf(property) !== -1,
        `Context has unexpected property: ${property}`);
    });

    // Always make monitor available in context
    // TODO: document this
    options.context.monitor = options.monitor;

    this.entries = this.builder.entries.map(_.clone);

    this.options = options;
  }

  /**
   * Publish this schema to an S3 bucket.
   *
   * This is only used for the `taskcluster.net` deployment.
   */
  async publish() {
    // Check that required options are provided
    assert(this.options.referenceBucket, '`referenceBucket` is required in order to publish');
    assert(this.options.aws, '`aws` is required in order to publish');

    // Create S3 object
    const s3 = new aws.S3(this.options.aws);

    // Get the reference and make it absolute
    const reference = this.builder.reference();
    reference.$schema = reference.$schema.replace(/\/schemas/, 'https://schemas.taskcluster.net');

    // Upload object
    await s3.putObject({
      Bucket: this.options.referenceBucket,
      Key: `${this.builder.serviceName}/${this.builder.apiVersion}/api.json`,
      Body: JSON.stringify(reference, undefined, 2),
      ContentType: 'application/json',
    }).promise();
  }

  /**
    * Create an express router, rooted *after* the apiVersion in the URL path
    */
  router() {
    const {
      monitor,
      allowedCORSOrigin,
      rootUrl,
      inputLimit,
      signatureValidator,
      validator,
      schemaset,
      context,
    } = this.options;
    const {errorCodes, serviceName} = this.builder;
    const absoluteSchemas = schemaset.absoluteSchemas(rootUrl);

    // Create router
    const router = express.Router();

    // Allow CORS requests to the API
    if (allowedCORSOrigin) {
      router.use(corsHeaders(allowedCORSOrigin));
    }

    router.use(cacheHeaders());

    // Add entries to router
    this.entries.forEach(entry => {
      // Route pattern
      const middleware = [entry.route];

      if (monitor) {
        middleware.push(monitor.expressMiddleware(entry.name));
      }

      middleware.push(
        buildReportErrorMethod(),
        parseBody({inputLimit}),
        remoteAuthentication({signatureValidator, entry}),
        parameterValidator({context, entry}),
        queryValidator({context, entry}),
        validateSchemas({validator, absoluteSchemas, rootUrl, serviceName, entry}),
        callHandler({entry, context, monitor}),
        expressError({errorCodes, entry, monitor})
      );

      // Create entry on router
      router[entry.method].apply(router, middleware);
    });

    // Return router
    return router;
  }

  express(app) {
    // generate the appropriate path for this service, based on the rootUrl
    const path = url.parse(
      libUrls.api(this.options.rootUrl, this.builder.serviceName, this.builder.apiVersion, '')).path;
    app.use(path, this.router());
  }
}

module.exports = API;

/**
 * Set up cache headers
 */
const cacheHeaders = () => {
  return (req, res, next) => {
    res.header('Cache-Control', 'no-store no-cache must-revalidate');
    next();
  };
};

/**
 * Set up CORS headers
 */
const corsHeaders = allowedCORSOrigin => {
  return (req, res, next) => {
    res.header('Access-Control-Allow-Origin', allowedCORSOrigin);
    res.header('Access-Control-Max-Age', 900);
    res.header('Access-Control-Allow-Methods', [
      'OPTIONS',
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'DELETE',
      'TRACE',
      'CONNECT',
    ].join(','));
    res.header('Access-Control-Request-Method', '*');
    res.header('Access-Control-Allow-Headers', [
      'X-Requested-With',
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'Cache-Control',
    ].join(','));
    next();
  };
};

/**
 * Local nonce cache for hawk, using an over-approximation
 *
 * options:
 * {
 *   size:             250   // Number of entries to keep track of
 * }
 *
 * Higher size helps mitigate replay attacks, but also takes more memory.
 * Please, note that this doesn't do much for replay-attacks if there are
 * multiple instance of the server process. But it's better than nothing,
 * and a lot cheaper and faster than using azure table storage.
 *
 * Ideally, nonces should probably be stored in something like memcache.
 */
const nonceManager = (options) => {
  options = _.defaults({}, options || {}, {
    size: 250,
  });
  let nextnonce = 0;
  const N = options.size;
  const noncedb = new Array(N);
  for (let i = 0; i < N; i++) {
    noncedb[i] = {nonce: null, ts: null};
  }
  return (nonce, ts, cb) => {
    for (let i = 0; i < N; i++) {
      if (noncedb[i].nonce === nonce && noncedb[i].ts === ts) {
        debug('CRITICAL: Replay attack detected!');
        return cb(new Error('Signature already used'));
      }
    }
    noncedb[nextnonce].nonce = nonce;
    noncedb[nextnonce].ts = ts;
    // Increment nextnonce
    nextnonce += 1;
    nextnonce %= N;
    cb();
  };
};

/**
 * Make a function for the remote signature validation.
 *
 * options:
 * {
 *    rootUrl:   ..
 * }
 *
 * The function returns takes an object:
 *     {method, resource, host, port, authorization, sourceIp}
 * And return promise for an object on one of the forms:
 *     {status: 'auth-failed', message},
 *     {status: 'auth-success', scheme, scopes}, or,
 *     {status: 'auth-success', scheme, scopes, hash}
 *
 * The method returned by this function works as `signatureValidator` for
 * `remoteAuthentication`.
 */
const createRemoteSignatureValidator = (options) => {
  assert(options.rootUrl, 'options.rootUrl is required');
  const auth = new taskcluster.Auth({
    rootUrl: options.rootUrl,
    credentials: {}, // We do this to avoid sending auth headers to authenticateHawk
  });
  return (data) => {
    return auth.authenticateHawk(data);
  };
};

// for tests
module.exports.nonceManager = nonceManager;
