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
  name:       'inspect',
  input:      null,
  output:     "http://schemas.taskcluster.net/auth/v1/client-scopes-response.json#",
  scopes:     ['auth:inspect', 'auth:credentials'],
  title:      "Get Client Authorized Scopes",
  description: [
    "Returns the scopes the client is authorized to access and the date-time",
    "where the clients authorization is set to expire.",
    "",
    "This API end-point allows you inspect clients without getting access to",
    "credentials, as provide by the `getCredentials` request below."
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
  input:      null,
  output:     "http://schemas.taskcluster.net/auth/v1/client-credentials-response.json#",
  scopes:     ['auth:credentials'],
  title:      "Get Client Credentials",
  description: [
    "Returns the clients `accessToken` as needed for verifying signatures.",
    "This API end-point also returns the list of scopes the client is",
    "authorized for and the date-time where the client authorization expires",
    "",
    "Remark, **if you don't need** the `accessToken` but only want to see what",
    "scopes a client is authorized for, you should use the `getScopes`",
    "function described above."
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
