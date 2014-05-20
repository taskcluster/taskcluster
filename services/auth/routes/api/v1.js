var debug       = require('debug')('routes:api:v1');
var request     = require('superagent-promise');
var assert      = require('assert');
var base        = require('taskcluster-base');

/** API end-point for version v1/ */
var api = new base.API({
  title:      "Authentication API",
  description: [
    "Authentication related API end-points for taskcluster."
  ].join('\n')
});

// Export API
module.exports = api;

/** Get authorized scopes for a given client */
api.declare({
  method:     'get',
  route:      '/client/:clientId/scopes',
  name:       'getScopes',
  input:      undefined,
  output:     undefined,
  scopes:     ['auth:inspect', 'auth:credentials'],
  title:      "Get Client Authorized Scopes",
  description: [
    "TODO: Write documentation..."
  ].join('\n')
}, function(req, res) {
  return this.Client.load(req.params.clientId).then(function(client) {
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
  description: [
    "TODO: Write documentation..."
  ].join('\n')
}, function(req, res) {
  return this.Client.load(req.params.clientId).then(function(client) {
    return res.reply({
      clientId:     client.clientId,
      accessToken:  client.accessToken,
      scopes:       client.scopes,
      expires:      client.expires.toJSON()
    });
  });
});

