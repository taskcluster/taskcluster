import url from 'url';
import assert from 'assert';
import debugFactory from 'debug';
const debug = debugFactory('taskcluster-lib-testing:FakeAuth');
import nock from 'nock';
import hawk from 'hawk';
import libUrls from 'taskcluster-lib-urls';
import taskcluster from 'taskcluster-client';

let anonymousScopes = [];

export const start = function(clients, { rootUrl } = {}) {
  assert(rootUrl, 'rootUrl option is required');
  const authPath = url.parse(libUrls.api(rootUrl, 'auth', 'v1', '/authenticate-hawk')).pathname;
  return nock(rootUrl, { encodedQueryParams: true, allowUnmocked: true })
    .persist()
    .filteringRequestBody(/.*/, '*')
    .post(authPath, '*')
    .reply(200, function(uri, body) {
      let scopes = [];
      let from = 'client config';
      let ext = null;
      let clientId = null;
      if (body.authorization) {
        let authorization = hawk.utils.parseAuthorizationHeader(body.authorization);
        clientId = authorization.id;
        scopes = clients[clientId];
        ext = authorization.ext;
      } else if (/^\/.*[\?&]bewit\=/.test(body.resource)) {
        // The following is a hacky reproduction of the bewit logic in
        // https://github.com/hueniverse/hawk/blob/0833f99ba64558525995a7e21d4093da1f3e15fa/lib/server.js#L366-L383
        let bewitString = url.parse(body.resource, true).query.bewit;
        if (bewitString) {
          let bewit = Buffer.from(bewitString, 'base64').toString('utf-8');
          let bewitParts = bewit.split('\\');
          clientId = bewitParts[0];
          if (!(clientId in clients)) {
            debug(`rejecting access to ${body.resource} by ${clientId}`);
            return { status: 'auth-failed', message: `client ${clientId} not configured in fakeauth` };
          }
          scopes = clients[clientId];
          ext = bewitParts[3] || '';
        }
      } else {
        return {
          status: 'no-auth',
          scheme: 'none',
          scopes: anonymousScopes,
          expires: new Date(Date.now() + 15 * 60 * 1000),
        };
      }
      if (ext) {
        ext = JSON.parse(Buffer.from(ext, 'base64').toString('utf-8'));
      } else {
        ext = {};
      }

      if (ext.certificate && ext.certificate.issuer) {
        clientId = ext.certificate.issuer;
      }

      if (!(clientId in clients)) {
        debug(`rejecting access to ${body.resource} by ${clientId}`);
        return { status: 'auth-failed', message: `client ${clientId} not configured in fakeauth` };
      }

      if (ext.authorizedScopes) {
        scopes = ext.authorizedScopes;
        from = 'ext.authorizedScopes';
      } else if (ext.certificate && ext.certificate.scopes) {
        scopes = ext.certificate.scopes;
        from = 'ext.certificate.scopes';
      }
      debug('authenticating access to ' + body.resource +
          ' by ' + clientId +
          ' with scopes ' + scopes.join(', ') +
          ' from ' + from);
      let expires = taskcluster.fromNow('2 minutes');
      return { status: 'auth-success', scheme: 'hawk', scopes, clientId, expires };
    });
};

export const stop = function() {
  // this is a bit more aggressive than we want to be, since it clears
  // all nock interceptors, not just the one we installed.  See
  // https://github.com/pgte/nock/issues/438
  nock.cleanAll();
};

// run the enclosed function with `anonymousScopes` set to a new value
export const withAnonymousScopes = async (scopes, fn) => {
  const saved = anonymousScopes;
  try {
    anonymousScopes = scopes;
    return await fn();
  } finally {
    anonymousScopes = saved;
  }
};
