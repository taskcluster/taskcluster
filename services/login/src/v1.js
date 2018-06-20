const APIBuilder = require('taskcluster-lib-api');

const builder = new APIBuilder({
  serviceName: 'login',
  version: 'v1',
  title:         'Login API',
  description:   [
    'The Login service serves as the interface between external authentication',
    'systems and Taskcluster credentials.',
  ].join('\n'),
  name: 'login',
  context: ['cfg', 'handlers'],
});

// Export builder
module.exports = builder;

builder.declare({
  method:     'get',
  route:      '/oidc-credentials/:provider',
  name:       'oidcCredentials',
  idempotent: false,
  output:     'oidc-credentials-response.yml',
  title:      'Get Taskcluster credentials given a suitable `access_token`',
  stability:  APIBuilder.stability.experimental,
  description: [
    'Given an OIDC `access_token` from a trusted OpenID provider, return a',
    'set of Taskcluster credentials for use on behalf of the identified',
    'user.',
    '',
    'This method is typically not called with a Taskcluster client library',
    'and does not accept Hawk credentials. The `access_token` should be',
    'given in an `Authorization` header:',
    '```',
    'Authorization: Bearer abc.xyz',
    '```',
    '',
    'The `access_token` is first verified against the named',
    ':provider, then passed to the provider\'s APIBuilder to retrieve a user',
    'profile. That profile is then used to generate Taskcluster credentials',
    'appropriate to the user. Note that the resulting credentials may or may',
    'not include a `certificate` property. Callers should be prepared for either',
    'alternative.',
    '',
    'The given credentials will expire in a relatively short time. Callers should',
    'monitor this expiration and refresh the credentials if necessary, by calling',
    'this endpoint again, if they have expired.',
  ].join('\n'),
}, async function(req, res) {
  // handlers are loaded from src/handlers based on cfg.handlers
  let handler = this.handlers[req.params.provider];

  if (!handler) {
    return res.reportError('InputError',
      'Invalid accessToken provider {{provider}}',
      {provider: req.params.provider});
  }

  let user = await handler.userFromRequest(req, res);

  if (!user) {
    // don't report much to the user, to avoid revealing sensitive information, although
    // it is likely in the service logs.
    return res.reportError('InputError',
      'Could not generate credentials for this access token',
      {});
  }

  // create and return temporary credentials, limiting expires to a max of 15 minutes
  let {credentials: issuer, startOffset} = this.cfg.app.temporaryCredentials;
  let {credentials, expires} = user.createCredentials({credentials: issuer, startOffset, expiry: '15 min'});

  // move expires back by 30 seconds to ensure the user refreshes well in advance of the
  // actual credential expiration time
  expires.setSeconds(expires.getSeconds() - 30);

  return res.reply({
    expires: expires.toJSON(),
    credentials,
  });
});
