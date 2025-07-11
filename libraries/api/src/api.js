import express from 'express';
import assert from 'assert';
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

/**
 * A service represents an instance of an API at a specific rootUrl, ready to
 * provide an Express router, references, etc.  It is constructed by APIBuilder.build().
 *
 * @template {Record<string, any>} TContext
 */
export default class API {
  /** @param {import('../@types/index.d.ts').APIOptions<TContext>} options */
  constructor(options) {
    assert(!options.authBaseUrl, 'authBaseUrl option is no longer allowed');
    assert(!options.baseUrl, 'baseUrl option is no longer allowed');
    assert(options.builder, 'builder option is required');
    assert(options.rootUrl, 'rootUrl option is required');
    assert(options.monitor, 'monitor option is required');
    assert(!options.referencePrefix, 'referencePrefix is now deprecated!');

    const resolvedOptions = {
      inputLimit: '10mb',
      allowedCORSOrigin: '*',
      referenceBucket: 'references.taskcluster.net',
      signatureValidator: createRemoteSignatureValidator({
        rootUrl: options.rootUrl,
      }),
      serviceName: options.builder.serviceName,
      apiVersion: options.builder.apiVersion,
      ...options,
      ...{
        context: options.context || {},
      },
    };
    this.builder = resolvedOptions.builder;

    // validate context
    this.builder.context?.forEach((property) => {
      assert(resolvedOptions.context[property] !== undefined,
        'Context must have declared property: \'' + property + '\'');
    });

    Object.keys(resolvedOptions.context).forEach(property => {
      assert(this.builder.context?.indexOf(property) !== -1,
        `Context has unexpected property: ${property}`);
    });

    // Always make monitor available in context
    resolvedOptions.context.monitor = resolvedOptions.monitor;

    this.entries = [...(this.builder.entries)];

    this.options = resolvedOptions;
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
      monitor,
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
        callHandler({ entry, monitor, context }),
        expressError({ errorCodes, entry }),
      ];

      // Create entry on router
      router[entry.method].apply(router, middleware);
    });

    // Return router
    return router;
  }

  /** @param {import('express').Express} app */
  express(app) {
    // generate the appropriate path for this service, based on the rootUrl
    const path = URL.parse(
      libUrls.api(this.options.rootUrl, this.builder.serviceName, this.builder.apiVersion, ''))?.pathname;
    if (path === null) {
      throw new Error('Failed to parse path');
    }
    app.use(path, this.router());
  }
}

/**
 * Set up cache headers
 *
 * @returns {import('express').RequestHandler}}
 */
const cacheHeaders = () => {
  return (req, res, next) => {
    res.header('Cache-Control', 'no-store no-cache must-revalidate');
    next();
  };
};

/**
 * Set up CORS headers
 *
 * @param {string} allowedCORSOrigin
 * @returns {import('express').RequestHandler}
 */
const corsHeaders = allowedCORSOrigin => {
  return (req, res, next) => {
    res.header('Access-Control-Allow-Origin', allowedCORSOrigin);
    res.header('Access-Control-Max-Age', '900');
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
 * @param {{ rootUrl: string }} options
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
