import hawk from 'hawk';
import assert from 'assert';

// Someone should rename utils to scopes...
import utils from 'taskcluster-lib-scopes';

import crypto from 'crypto';

/**
 * Limit the client scopes and possibly use temporary keys.
 *
 * Takes a client object on the form: `{clientId, accessToken, scopes}`,
 * applies scope restrictions, certificate validation and returns a clone if
 * modified (otherwise it returns the original).
 */
const parseExt = function(ext) {
  // Attempt to parse ext
  try {
    ext = JSON.parse(Buffer.from(ext, 'base64').toString('utf-8'));
  } catch (err) {
    throw new Error('Failed to parse ext');
  }

  return ext;
};

/**
 * Limit the client scopes and possibly use temporary keys.
 *
 * Takes a client object on the form: `{clientId, accessToken, scopes}`,
 * applies scope restrictions, certificate validation and returns a clone if
 * modified (otherwise it returns the original).
 */
const limitClientWithExt = function(credentialName, issuingClientId, accessToken, scopes,
  expires, ext, expandScopes) {
  let issuingScopes = scopes;
  let res = { scopes, expires, accessToken };

  // Handle certificates
  if (ext.certificate) {
    let cert = ext.certificate;
    // Validate the certificate
    if (!(cert instanceof Object)) {
      throw new Error('ext.certificate must be a JSON object');
    }
    if (cert.version !== 1) {
      throw new Error('ext.certificate.version must be 1');
    }
    if (typeof cert.seed !== 'string') {
      throw new Error('ext.certificate.seed must be a string');
    }
    if (cert.seed.length !== 44) {
      throw new Error('ext.certificate.seed must be 44 characters');
    }
    if (typeof cert.start !== 'number') {
      throw new Error('ext.certificate.start must be a number');
    }
    if (typeof cert.expiry !== 'number') {
      throw new Error('ext.certificate.expiry must be a number');
    }
    if (!(cert.scopes instanceof Array)) {
      throw new Error('ext.certificate.scopes must be an array');
    }
    if (!cert.scopes.every(utils.validScope)) {
      throw new Error('ext.certificate.scopes must be an array of valid scopes');
    }

    // Check start and expiry
    let now = new Date().getTime();
    if (cert.start > now + 5 * 60 * 1000) {
      throw new Error('ext.certificate.start > now');
    }
    if (cert.expiry < now - 5 * 60 * 1000) {
      throw new Error('ext.certificate.expiry < now');
    }
    // Check max time between start and expiry
    if (cert.expiry - cert.start > 31 * 24 * 60 * 60 * 1000) {
      throw new Error('ext.certificate cannot last longer than 31 days!');
    }

    // Check clientId validity
    if (issuingClientId !== credentialName) {
      let createScope = 'auth:create-client:' + credentialName;
      if (!utils.satisfiesExpression(issuingScopes, createScope)) {
        throw new Error('ext.certificate issuer `' + issuingClientId +
                        '` doesn\'t have `' + createScope + '` for supplied clientId.');
      }
    } else if ('clientId' in cert) {
      throw new Error('ext.certificate.clientId must only be used with ext.certificate.issuer');
    }

    // Validate certificate scopes are subset of client
    if (!utils.satisfiesExpression(scopes, { AllOf: cert.scopes })) {
      throw new Error('ext.certificate issuer `' + issuingClientId +
                      '` doesn\'t satisfy all certificate scopes ' +
                      cert.scopes.join(', ') + '.  The temporary ' +
                      'credentials were not generated correctly.');
    }

    // Generate certificate signature
    let sigContent = [];
    sigContent.push('version:' + '1');
    if (cert.issuer) {
      sigContent.push('clientId:' + credentialName);
      sigContent.push('issuer:' + cert.issuer);
    }
    sigContent.push('seed:' + cert.seed);
    sigContent.push('start:' + cert.start);
    sigContent.push('expiry:' + cert.expiry);
    sigContent.push('scopes:');
    sigContent = sigContent.concat(cert.scopes);
    let signature = crypto.createHmac('sha256', accessToken)
      .update(sigContent.join('\n'))
      .digest('base64');

    // Validate signature
    if (typeof cert.signature !== 'string' ||
        !crypto.timingSafeEqual(Buffer.from(cert.signature), Buffer.from(signature))) {
      if (cert.issuer) {
        throw new Error('ext.certificate.signature is not valid, or wrong clientId provided');
      } else {
        throw new Error('ext.certificate.signature is not valid');
      }
    }

    // Regenerate temporary key
    let temporaryKey = crypto.createHmac('sha256', accessToken)
      .update(cert.seed)
      .digest('base64')
      .replace(/\+/g, '-') // Replace + with - (see RFC 4648, sec. 5)
      .replace(/\//g, '_') // Replace / with _ (see RFC 4648, sec. 5)
      .replace(/=/g, ''); // Drop '==' padding

    // Update expiration, scopes and accessToken
    res.accessToken = temporaryKey;

    let cert_expires = new Date(cert.expiry);
    if (res.expires > cert_expires) {
      res.expires = cert_expires;
    }

    res.scopes = scopes = cert.scopes;
  }

  // Handle scope restriction with authorizedScopes
  if (ext.authorizedScopes) {
    // Validate input format
    if (!(ext.authorizedScopes instanceof Array)) {
      throw new Error('ext.authorizedScopes must be an array');
    }
    if (!ext.authorizedScopes.every(utils.validScope)) {
      throw new Error('ext.authorizedScopes must be an array of valid scopes');
    }

    // Implicitly grant all clients the anonymous role _before_ we check
    // `authorizedScopes`. If we didn't do this first then the check that
    // the client has a superset of `authorizedScopes` can fail if the scope
    // is provided by it being in `anonymous`
    res.scopes = utils.mergeScopeSets(res.scopes, ['assume:anonymous']);
    res.scopes = expandScopes(res.scopes);

    // Validate authorizedScopes scopes are satisfied by client (or temp) scopes
    if (!utils.satisfiesExpression(res.scopes, { AllOf: ext.authorizedScopes })) {
      throw new Error([
        'Supplied credentials do not satisfy authorizedScopes; credentials have scopes:',
        '',
        '```',
        res.scopes.join('\n'),
        '```',
        '',
        'authorizedScopes are:',
        '',
        '```',
        ext.authorizedScopes.join('\n'),
        '```',
      ].join('\n'));
    }

    res.scopes = scopes = ext.authorizedScopes;
  }
  return res;
};

/**
 * Make a function for the signature validation.
 *
 * options:
 * {
 *    clientLoader:   async (clientId) => {clientId, expires, accessToken, scopes},
 *    expandScopes:   (scopes) => scopes,
 *    monitor:        // an instance of @taskcluster/lib-monitor
 * }
 *
 * The function returned takes an object:
 *     {method, resource, host, port, authorization, sourceIp}
 * And returns promise for an object on one of the forms:
 *     {status: 'auth-failed', message},
 *     {status: 'auth-success', clientId, scheme, scopes}, or
 *     {status: 'auth-success', clientId, scheme, scopes, hash}
 * where `hash` is the payload hash.
 *
 * The `expandScopes` applies any rules that expands scopes, such as roles.
 * It is assumed that clients from `clientLoader` are returned with scopes
 * fully expanded.
 *
 * The method returned by this function works as `signatureValidator` for
 * `remoteAuthentication`.
 */
const createSignatureValidator = function(options) {
  assert(typeof options === 'object', 'options must be an object');
  assert(options.clientLoader instanceof Function,
    'options.clientLoader must be a function');
  if (!options.expandScopes) {
    // Default to the identity function
    options.expandScopes = function(scopes) { return scopes; };
  }
  assert(options.expandScopes instanceof Function,
    'options.expandScopes must be a function');
  assert(options.monitor, 'options.monitor must be provided');

  const loadCredentials = async (clientId, ext) => {
    // We may have two clientIds here: the credentialName (the one the caller
    // sent in the Hawk Authorization header) and the issuingClientId (the one
    // that signed the temporary credentials).
    let credentialName = clientId,
      issuingClientId = clientId;

    // extract ext.certificate.issuer, if present
    if (ext) {
      ext = parseExt(ext);
      if (ext.certificate && ext.certificate.issuer) {
        issuingClientId = ext.certificate.issuer;
        if (typeof issuingClientId !== 'string') {
          throw new Error('ext.certificate.issuer must be a string');
        }
        if (issuingClientId === credentialName) {
          throw new Error('ext.certificate.issuer must differ from the supplied clientId');
        }
      }
    }

    let accessToken, scopes, expires;
    ({ clientId, expires, accessToken, scopes } = await options.clientLoader(issuingClientId));

    // apply restrictions based on the ext field
    if (ext) {
      ({ scopes, expires, accessToken } = limitClientWithExt(
        credentialName, issuingClientId, accessToken,
        scopes, expires, ext, options.expandScopes));
    }

    // Implicitly grant all clients the anonymous role a second time.
    // This is required to add it back in if it has been removed by
    // it (and the scopes it grants) _not_ being included in authorizedScopes.
    scopes = utils.mergeScopeSets(scopes, ['assume:anonymous']);
    scopes = options.expandScopes(scopes);

    return {
      key: accessToken,
      algorithm: 'sha256',
      clientId: credentialName,
      expires: expires,
      scopes: scopes,
    };
  };

  return async function(req) {
    let credentials, attributes, result, authResult;

    try {
      if (req.authorization) {
        authResult = await hawk.server.authenticate({
          method: req.method.toUpperCase(),
          url: req.resource,
          host: req.host,
          port: req.port,
          authorization: req.authorization,
        }, async (clientId) => {
          let ext = undefined;

          // Parse authorization header for ext
          let attrs = hawk.utils.parseAuthorizationHeader(
            req.authorization,
          );
          // Extra ext
          if (!(attrs instanceof Error)) {
            ext = attrs.ext;
          }

          // Get credentials with ext
          return loadCredentials(clientId, ext);
        }, {
          // Not sure if JSON stringify is not deterministic by specification.
          // I suspect not, so we'll postpone this till we're sure we want to do
          // payload validation and how we want to do it.
          //payload:      JSON.stringify(req.body),

          // We found that clients often have time skew (particularly on OSX)
          // since all our services require https we hardcode the allowed skew
          // to a very high number (15 min) similar to AWS.
          timestampSkewSec: 15 * 60,
        });

        credentials = authResult.credentials;
        attributes = authResult.artifacts; // Hawk uses "artifacts" and "attributes"
      } else if (/^\/.*[\?&]bewit\=/.test(req.resource)) { // using regex because query parsing is disabled
        // Bewit present
        authResult = await hawk.uri.authenticate({
          method: req.method.toUpperCase(),
          url: req.resource,
          host: req.host,
          port: req.port,
        }, async (clientId) => {
          let ext = undefined;

          // Get bewit string (stolen from hawk)
          let parts = req.resource.match(
            /^(\/.*)([\?&])bewit\=([^&$]*)(?:&(.+))?$/,
          );

          let bewitString;
          try {
            if (!/^[\w\-]*$/.test(parts[3])) {
              throw new Error('invalid character in bewit');
            }
            bewitString = Buffer.from(parts[3], 'base64').toString('binary');
          } catch (err) {
            bewitString = err;
          }

          if (!(bewitString instanceof Error)) {
            // Split string as hawk does it
            let parts = bewitString.split('\\');
            if (parts.length === 4 && parts[3]) {
              ext = parts[3];
            }
          }

          // Get credentials with ext
          return loadCredentials(clientId, ext);
        }, {});

        credentials = authResult.credentials;
        attributes = authResult.attributes;
      } else {
        // No auth provided
        result = {
          status: 'no-auth',
          scheme: 'none',
          expires: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes in future
          scopes: options.expandScopes(['assume:anonymous']),
        };
      }
      result = result || {
        status: 'auth-success',
        scheme: 'hawk',
        expires: credentials.expires,
        scopes: credentials.scopes,
        clientId: credentials.clientId,
      };
      if (attributes && attributes.hash) {
        result.hash = attributes.hash;
      }
    } catch (err) {
      let message = err.message || err.toString();
      // Hawk converts all errors to Boom's, hiding errors from things like
      // clientLoader.  However, it leaves err.message alone.  So, handle
      // non-server boom's by getting the payload error/message, but return
      // others as a simple error string.
      if (err.isBoom && !err.isServer) {
        message = err.output.payload.error;
        if (err.output.payload.message) {
          message += ': ' + err.output.payload.message;
        }
      }
      result = {
        status: 'auth-failed',
        message: message.toString(),
      };
    }

    return result;
  };
};

export default createSignatureValidator;
