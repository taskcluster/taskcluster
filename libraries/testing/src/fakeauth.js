var debug = require('debug')('taskcluster-lib-testing:FakeAuth');
var nock = require('nock');
var hawk = require('hawk');

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
    return {status: "auth-success", scheme: "hawk", scopes: scopes, clientId: authorization.id};
  });
};

exports.stop = function() {
  // this is a bit more aggressive than we want to be, since it clears
  // all nock interceptors, not just the one we installed.  See
  // https://github.com/pgte/nock/issues/438
  nock.cleanAll();
}
