var debug = require('debug')('taskcluster-lib-testing:FakeAuth');
var nock = require('nock');
var hawk = require('hawk');

/**
 * Intercept requests to the auth service's authenticateHawk method and
 * return a response based on clients, instead.  This is useful when testing
 * other API services.  Note that accessTokens are not checked -- the fake
 * simply controls access based on clientId or the scopes in a temporary
 * credential or supplied with authorizedScopes.
 *
 * Clients is on the form
 * ```js
 * {
 *  "clientId1": ["scope1", "scope2"],
 *  "clientId2": ["scope1", "scope3"],
 * }
 *
 * Call `stop` in your test's `after` method to stop the HTTP interceptor.
 */
exports.start = function(clients) {
  nock('https://auth.taskcluster.net:443', {encodedQueryParams:true, allowUnmocked: true})
  .persist()
  .filteringRequestBody(/.*/, '*')
  .post('/v1/authenticate-hawk', '*')
  .reply(200, function(uri, requestBody) {
    var body = JSON.parse(requestBody);
    var authorization = hawk.utils.parseAuthorizationHeader(body.authorization);
    var scopes = clients[authorization.id] || [];
    var from = 'client config';
    if (authorization.ext) {
      var ext = JSON.parse(new Buffer(authorization.ext, 'base64')
                           .toString('utf-8'));
      if (ext.authorizedScopes) {
        scopes = ext.authorizedScopes;
        from = 'ext.authorizedScopes';
      } else if (ext.certificate.scopes) {
        scopes = ext.certificate.scopes;
        from = 'ext.certificate.scopes';
      }
    }
    debug("authenticating access to " + body.resource + " by " +
          authorization.id + " with scopes " + scopes.join(", ") +
          " from " + from);
    return {status: "auth-success", scheme: "hawk", scopes: scopes};
  });
};

exports.stop = function() {
  // this is a bit more aggressive than we want to be, since it clears
  // all nock interceptors, not just the one we installed.  See
  // https://github.com/pgte/nock/issues/438
  nock.cleanAll();
}
