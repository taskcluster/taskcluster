"use strict";

var debug         = require('debug')('auth:signaturevalidator');
var Promise       = require('promise');
var hawk          = require('hawk');
var assert        = require('assert');
var _             = require('lodash');
require('superagent-hawk')(require('superagent'));
// Someone should rename utils to scopes... 
var utils         = require('taskcluster-lib-scopes');
var hoek          = require('hoek');
var https         = require('https');
var cryptiles     = require('cryptiles');
var crypto        = require('crypto');

/**
 * Limit the client scopes and possibly use temporary keys.
 *
 * Takes a client object on the form: `{clientId, accessToken, scopes}`,
 * applies scope restrictions, certificate validation and returns a clone if
 * modified (otherwise it returns the original).
 */
var parseExt = function(ext) {
  // Attempt to parse ext
  try {
    ext = JSON.parse(new Buffer(ext, 'base64').toString('utf-8'));
  }
  catch(err) {
    throw new Error("Failed to parse ext");
  }

  return ext;
}

/**
 * Limit the client scopes and possibly use temporary keys.
 *
 * Takes a client object on the form: `{clientId, accessToken, scopes}`,
 * applies scope restrictions, certificate validation and returns a clone if
 * modified (otherwise it returns the original).
 */
var limitClientWithExt = function(credentialName, issuingClientId, accessToken, scopes, ext, expandScopes) {
  let issuingScopes = scopes;
  let res = {scopes, accessToken};

  // Handle certificates
  if (ext.certificate) {
    var cert = ext.certificate;
    // Validate the certificate
    if (!(cert instanceof Object)) {
      throw new Error("ext.certificate must be a JSON object");
    }
    if (cert.version !== 1) {
      throw new Error("ext.certificate.version must be 1");
    }
    if (typeof(cert.seed) !== 'string') {
      throw new Error('ext.certificate.seed must be a string');
    }
    if (cert.seed.length !== 44) {
      throw new Error('ext.certificate.seed must be 44 characters');
    }
    if (typeof(cert.start) !== 'number') {
      throw new Error('ext.certificate.start must be a number');
    }
    if (typeof(cert.expiry) !== 'number') {
      throw new Error('ext.certificate.expiry must be a number');
    }
    if (!(cert.scopes instanceof Array)) {
      throw new Error("ext.certificate.scopes must be an array");
    }
    if (!cert.scopes.every(utils.validScope)) {
      throw new Error("ext.certificate.scopes must be an array of valid scopes");
    }

    // Check start and expiry
    var now = new Date().getTime();
    if (cert.start > now) {
      throw new Error("ext.certificate.start > now");
    }
    if (cert.expiry < now) {
      throw new Error("ext.certificate.expiry < now");
    }
    // Check max time between start and expiry
    if (cert.expiry - cert.start > 31 * 24 * 60 * 60 * 1000) {
      throw new Error("ext.certificate cannot last longer than 31 days!");
    }

    // Check clientId validity
    if (issuingClientId !== credentialName) {
      let createScope = 'auth:create-client:' + credentialName;
      if (!utils.scopeMatch(issuingScopes, [[createScope]])) {
        throw new Error("ext.certificate issuer `" + issuingClientId +
                        "` doesn't have `" + createScope + "` for supplied clientId.");
      }
    } else {
      if (cert.hasOwnProperty('clientId')) {
        throw new Error('ext.certificate.clientId must only be used with ext.certificate.issuer');
      }
    }

    // Validate certificate scopes are subset of client
    if (!utils.scopeMatch(scopes, [cert.scopes])) {
      throw new Error("ext.certificate issuer `" + issuingClientId +
                      "` doesn't satisfiy all certificate scopes " +
                      cert.scopes.join(', ') + ".  The temporary " +
                      "credentials were not generated correctly.");
    }

    // Generate certificate signature
    var sigContent = []
    sigContent.push('version:'    + '1');
    if (cert.issuer) {
      sigContent.push('clientId:' + credentialName);
      sigContent.push('issuer:'   + cert.issuer);
    }
    sigContent.push('seed:'       + cert.seed);
    sigContent.push('start:'      + cert.start);
    sigContent.push('expiry:'     + cert.expiry);
    sigContent.push('scopes:');
    sigContent = sigContent.concat(cert.scopes);
    var signature = crypto.createHmac('sha256', accessToken)
      .update(sigContent.join('\n'))
      .digest('base64');

    // Validate signature
    if (typeof(cert.signature) !== 'string' ||
        !cryptiles.fixedTimeComparison(cert.signature, signature)) {
      if (cert.issuer) {
        throw new Error("ext.certificate.signature is not valid, or wrong clientId provided");
      } else {
        throw new Error("ext.certificate.signature is not valid");
      }
    }

    // Regenerate temporary key
    var temporaryKey = crypto.createHmac('sha256', accessToken)
      .update(cert.seed)
      .digest('base64')
      .replace(/\+/g, '-')  // Replace + with - (see RFC 4648, sec. 5)
      .replace(/\//g, '_')  // Replace / with _ (see RFC 4648, sec. 5)
      .replace(/=/g,  '');  // Drop '==' padding

    // Update scopes and accessToken
    res.accessToken = temporaryKey;
    res.scopes = scopes = expandScopes(cert.scopes);
  }

  // Handle scope restriction with authorizedScopes
  if (ext.authorizedScopes) {
    // Validate input format
    if (!(ext.authorizedScopes instanceof Array)) {
      throw new Error("ext.authorizedScopes must be an array");
    }
    if (!ext.authorizedScopes.every(utils.validScope)) {
      throw new Error("ext.authorizedScopes must be an array of valid scopes");
    }

    // Validate authorizedScopes scopes are satisfied by client (or temp) scopes
    if (!utils.scopeMatch(res.scopes, [ext.authorizedScopes])) {
      throw new Error('Supplied credentials do not satisfy authorizedScopes; '
        + `credentials have scopes [${res.scopes}]; `
        + `authorizedScopes are [${[ext.authorizedScopes]}]`);
    }

    // Further limit scopes
    res.scopes = scopes = expandScopes(ext.authorizedScopes);
  }

  return res;
};


/**
 * Make a function for the signature validation.
 *
 * options:
 * {
 *    clientLoader:   async (clientId) => {clientId, accessToken, scopes},
 *    nonceManager:   nonceManager({size: ...}),
 *    expandScopes:   (scopes) => scopes,
 * }
 *
 * The function returned takes an object:
 *     {method, resource, host, port, authorization}
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
var createSignatureValidator = function(options) {
  assert(typeof(options) === 'object', "options must be an object");
  assert(options.clientLoader instanceof Function,
         "options.clientLoader must be a function");
  if (!options.expandScopes) {
    // Default to the identity function
    options.expandScopes = function(scopes) { return scopes; };
  }
  assert(options.expandScopes instanceof Function,
         "options.expandScopes must be a function");
  var loadCredentials = function(clientId, ext, callback) {
    // We may have two clientIds here: the credentialName (the one the caller
    // sent in the Hawk Authorization header) and the issuingClientId (the one
    // that signed the temporary credentials).
    let credentialName = clientId,
        issuingClientId = clientId;

    (async () => {
      // extract ext.certificate.issuer, if present
      if (ext) {
        ext = parseExt(ext);
        if (ext.certificate && ext.certificate.issuer) {
          issuingClientId = ext.certificate.issuer;
          if (typeof(issuingClientId) !== 'string') {
            throw new Error('ext.certificate.issuer must be a string');
          }
          if (issuingClientId == credentialName) {
            throw new Error('ext.certificate.issuer must differ from the supplied clientId');
          }
        }
      }

      var accessToken, scopes;
      ({clientId, accessToken, scopes} = await options.clientLoader(issuingClientId));

      // apply restrictions based on the ext field
      if (ext) {
        ({scopes, accessToken} = limitClientWithExt(
            credentialName, issuingClientId, accessToken,
            scopes, ext, options.expandScopes));
      }

      callback(null, {
        key:       accessToken,
        algorithm: 'sha256',
        clientId:  credentialName,
        scopes:    scopes
      });
    })().catch(callback);
  };
  return function(req) {
    return new Promise(function(accept) {
      var authenticated = function(err, credentials, artifacts) {
        var result = null;
        if (err) {
          var message = "Unknown authorization error";
          if (err.output && err.output.payload && err.output.payload.error) {
            message = err.output.payload.error;
            if (err.output.payload.message) {
              message += ": " + err.output.payload.message;
            }
          } else if(err.message) {
            message = err.message;
          }
          result = {
            status:   'auth-failed',
            message:  '' + message
          };
        } else {
          result = {
            status:   'auth-success',
            scheme:   'hawk',
            scopes:   credentials.scopes,
            clientId: credentials.clientId
          };
          if (artifacts.hash) {
            result.hash = artifacts.hash;
          }
        }
        return accept(result);
      };
      if (req.authorization) {
        hawk.server.authenticate({
          method:           req.method.toUpperCase(),
          url:              req.resource,
          host:             req.host,
          port:             req.port,
          authorization:    req.authorization
        }, function(clientId, callback) {
          var ext = undefined;

          // Parse authorization header for ext
          var attrs = hawk.utils.parseAuthorizationHeader(
            req.authorization
          );
          // Extra ext
          if (!(attrs instanceof Error)) {
            ext = attrs.ext;
          }

          // Get credentials with ext
          loadCredentials(clientId, ext, callback);
        }, {
          // Not sure if JSON stringify is not deterministic by specification.
          // I suspect not, so we'll postpone this till we're sure we want to do
          // payload validation and how we want to do it.
          //payload:      JSON.stringify(req.body),

          // We found that clients often have time skew (particularly on OSX)
          // since all our services require https we hardcode the allowed skew
          // to a very high number (15 min) similar to AWS.
          timestampSkewSec: 15 * 60,

          // Provide nonce manager
          nonceFunc:    options.nonceManager
        }, authenticated);
      } else {
      // If there is no authorization header we'll attempt a login with bewit
        hawk.uri.authenticate({
          method:           req.method.toUpperCase(),
          url:              req.resource,
          host:             req.host,
          port:             req.port
        }, function(clientId, callback) {
          var ext = undefined;

          // Get bewit string (stolen from hawk)
          var parts = req.resource.match(
            /^(\/.*)([\?&])bewit\=([^&$]*)(?:&(.+))?$/
          );
          var bewitString = hoek.base64urlDecode(parts[3]);
          if (!(bewitString instanceof Error)) {
            // Split string as hawk does it
            var parts = bewitString.split('\\');
            if (parts.length === 4 && parts[3]) {
              ext = parts[3];
            }
          }

          // Get credentials with ext
          loadCredentials(clientId, ext, callback);
        }, {}, authenticated);
      }
    });
  };
};

exports.createSignatureValidator = createSignatureValidator;
