import express from 'express';
import url from 'url';
import Debug from 'debug';
import assert from 'assert';
import _ from 'lodash';
import libUrls from 'taskcluster-lib-urls';
import taskcluster from 'taskcluster-client';
import { buildReportErrorMethod } from './middleware/errors.js';
import { callHandler } from './middleware/handle.js';
import { validateSchemas } from './middleware/schema.js';
import { queryValidator } from './middleware/queries.js';
import { parameterValidator } from './middleware/parameters.js';
import { remoteAuthentication } from './middleware/auth.js';
import { parseBody } from './middleware/parse.js';
import { expressError } from './middleware/express-error.js';
import { logRequest } from './middleware/logging.js';
import { perRequestContext } from './middleware/per-request-context.js';

const debug = Debug('api');

/**
 * A service represents an instance of an API at a specific rootUrl, ready to
 * provide an Express router, references, etc.  It is constructed by APIBuilder.build().
 */
export default class API {
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
    options.context.monitor = options.monitor;

    this.entries = this.builder.entries.map(_.clone);

    this.options = options;
  }

  /**
    * Create an express router, rooted *after* the apiVersion in the URL path
    */
  router() {
    const {
      allowedCORSOrigin,
      rootUrl,
      inputLimit,
      signatureValidator,
      validator,
      schemaset,
      context,
    } = this.options;
    const { errorCodes, serviceName } = this.builder;
    const absoluteSchemas = schemaset.absoluteSchemas(rootUrl);

    // Create router
    const router = express.Router({ caseSensitive: true });

    // Allow CORS requests to the API
    if (allowedCORSOrigin) {
      router.use(corsHeaders(allowedCORSOrigin));
    }

    router.use(cacheHeaders());

    // Add entries to router
    this.entries.forEach(entry => {
      const middleware = [
        entry.route,
        perRequestContext({ entry, context }),
        logRequest({ builder: this.builder, entry }),
        buildReportErrorMethod(),
        parseBody({ inputLimit }),
        remoteAuthentication({ signatureValidator, entry }),
        parameterValidator({ entry }),
        queryValidator({ entry }),
        validateSchemas({ validator, absoluteSchemas, rootUrl, serviceName, entry }),
        callHandler({ entry }),
        expressError({ errorCodes, entry }),
      ];

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
export const nonceManager = (options) => {
  options = _.defaults({}, options || {}, {
    size: 250,
  });
  let nextnonce = 0;
  const N = options.size;
  const noncedb = new Array(N);
  for (let i = 0; i < N; i++) {
    noncedb[i] = { nonce: null, ts: null };
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
  return async (data, meta) => {
    let perRequestAuth = auth;
    if (meta && auth.taskclusterPerRequestInstance !== undefined) {
      perRequestAuth = auth.taskclusterPerRequestInstance(meta);
    }
    return perRequestAuth.authenticateHawk(data);
  };
};
