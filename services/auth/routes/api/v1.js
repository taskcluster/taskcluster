var nconf       = require('nconf');
var utils       = require('./utils');
var slugid      = require('slugid');
var Promise     = require('promise');
var _           = require('lodash');
var debug       = require('debug')('routes:api:v1');
var request     = require('superagent-promise');
var assert      = require('assert');
var Client      = require('../../auth/data').Client;

/** API end-point for version v1/ */
var api = module.exports = new utils.API({
  limit:          '10mb'
});


var hawk = require('hawk');


var findUser = function(id, cb) {
  var credentials = {
    // Required
    id:         'dfsadjfkdsjflsadfjsdfsd',
    key:        'dfsadjfkdsjflsadfjsdfsd',
    algorithm:  'sha256',

    // Application specific
    scopes: ['queue:*', 'scheduler:status']
  };
  cb(null, credentials);
};

/** Local nonce cache, using an over-approximation */
var nonceManager = function() {
  var nextnonce = 0;
  var N = 500;
  var noncedb = new Array(500);
  for(var i = 0; i < 500; i++) {
    noncedb[i] = {nonce: null, ts: null};
  }
  return function(nonce, ts, cb) {
    for(var i = 0; i < 500; i++) {
      if (noncedb[i].nonce === nonce && noncedb[i].ts === ts) {
        debug("CRITICAL: Replay attack detected!");
        return cb(new Error("Signature already used"));
      }
    }
    noncedb[nextnonce++].nonce  = nonce;
    noncedb[nextnonce++].ts     = ts;
    cb();
  };
};
var nonceFunc = nonceManager();



/** Get task-graph status */
/*api.declare({
  method:     'get',
  route:      '/restricted',
  input:      undefined,
  output:     undefined,
  title:      "Test interface",
  desc: [
    "TODO: Write documentation..."
  ].join('\n')
}, function(req, res) {
  var oldUrl = req.url;
  return new Promise(function(accept, reject) {
    req.url = req.originalUrl;
    console.log(JSON.stringify(req.body));
    var options = {
      payload:      JSON.stringify(req.body),
      nonceFunc:    nonceFunc
    };
    hawk.server.authenticate(req, findUser, options, function(err, credentials, artifacts) {
      req.url = oldUrl;
      console.log("Error: ", JSON.stringify(err));
      console.log("credentials: ", JSON.stringify(credentials));
      console.log("Artifacts: ", JSON.stringify(artifacts));
      res.json(credentials);
      accept();
    });
  });
});*/


/** Get authorized scopes for a given client */
api.declare({
  method:     'get',
  route:      '/client/:clientId/scopes',
  name:       'getScopes',
  input:      undefined,
  output:     undefined,
  scopes:     ['auth:inspect', 'auth:credentials'],
  title:      "Get Client Authorized Scopes",
  desc: [
    "TODO: Write documentation..."
  ].join('\n')
}, function(req, res) {
  return Client.load(req.params.clientId).then(function(client) {
    return res.reply({
      clientId:     client.clientId,
      scopes:       client.scopes,
      expires:      client.expires.toJSON()
    });
  });
});


/** Get credentials for a given client */
api.declare({
  method:     'get',
  route:      '/client/:clientId/credentials',
  name:       'getCredentials',
  input:      undefined,
  output:     undefined,
  scopes:     ['auth:credentials'],
  title:      "Get Client Credentials",
  desc: [
    "TODO: Write documentation..."
  ].join('\n')
}, function(req, res) {
  return Client.load(req.params.clientId).then(function(client) {
    return res.reply({
      clientId:     client.clientId,
      accessToken:  client.accessToken,
      scopes:       client.scopes,
      expires:      client.expires.toJSON()
    });
  });
});









