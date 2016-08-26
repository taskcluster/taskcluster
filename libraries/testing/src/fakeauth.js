var debug = require('debug')('taskcluster-lib-testing:FakeAuth');
var nock = require('nock');
var hawk = require('hawk');
var url  = require('url');
var taskcluster  = require('taskcluster-client');

exports.start = function(clients) {
  nock('https://auth.taskcluster.net:443', {encodedQueryParams:true, allowUnmocked: true})
  .persist()
  .filteringRequestBody(/.*/, '*')
  .post('/v1/authenticate-hawk', '*')
  .reply(200, function(uri, requestBody) {
    let body = JSON.parse(requestBody);
    let scopes = [];
    let from = 'client config';
    let ext = null;
    let clientId = null;
    if (body.authorization) {
      let authorization = hawk.utils.parseAuthorizationHeader(body.authorization);
      clientId = authorization.id;
      scopes = clients[clientId] || [];
      ext = authorization.ext;
    }
    else {
      // The following is a hacky reproduction of the bewit logic in
      // https://github.com/hueniverse/hawk/blob/0833f99ba64558525995a7e21d4093da1f3e15fa/lib/server.js#L366-L383
      let bewitString = url.parse(body.resource, true).query.bewit;
      if (bewitString) {
        let bewit = new Buffer(bewitString, 'base64').toString('utf-8');
        let bewitParts = bewit.split('\\');
        clientId = bewitParts[0];
        scopes = clients[clientId];
        ext = bewitParts[3] || '';
      }
    }
    if (ext) {
      ext = JSON.parse(new Buffer(ext, 'base64').toString('utf-8'));
      if (ext.authorizedScopes) {
        scopes = ext.authorizedScopes;
        from = 'ext.authorizedScopes';
      } else if (ext.certificate.scopes) {
        scopes = ext.certificate.scopes;
        from = 'ext.certificate.scopes';
      }
    }
    debug("authenticating access to " + body.resource +
          " by " + clientId +
          " with scopes " + scopes.join(", ") +
          " from " + from);
    expires = taskcluster.fromNow('2 minutes');
    return {status: "auth-success", scheme: "hawk", scopes, clientId, expires};
  });
};

exports.stop = function() {
  // this is a bit more aggressive than we want to be, since it clears
  // all nock interceptors, not just the one we installed.  See
  // https://github.com/pgte/nock/issues/438
  nock.cleanAll();
}
