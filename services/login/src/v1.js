import API from 'taskcluster-lib-api'
import User from './user'
import _ from 'lodash'

var api = new API({
  title:         "Login API",
  description:   [
    "The Login service serves as the interface between external authentication",
    "systems and TaskCluster credentials.  It acts as the server side of",
    "https://tools.taskcluster.net.  If you are working on federating logins",
    "with TaskCluster, this is probably *not* the service you are looking for.",
    "Instead, use the federated login support in the tools site.",
    "",
    "The API methods described here issue temporary credentials based on",
    "an assertion.  The assertion identifies the user, usually with an",
    "email-like string.  This string is then passed through a series of",
    "authorizers, each of which may supply scopes to be included in the",
    "credentials. Finally, the service generates temporary credentials based",
    "on those scopes.",
    "",
    "The generated credentials include scopes to create new, permanent clients",
    "with names based on the user's identifier.  These credentials are",
    "periodically scanned for scopes that the user does not posess, and disabled",
    "if such scopes are discovered.  Thus users can create long-lived credentials",
    "that are only usable until the user's access level is reduced.",
  ].join('\n'),
  schemaPrefix:  'http://schemas.taskcluster.net/login/v1/',
  context: ['authorizer', 'personaVerifier', 'temporaryCredentials'],
});

// Export api
module.exports = api;

api.declare({
  method:     'post',
  route:      '/persona',
  name:       'credentialsFromPersonaAssertion',
  idempotent: false,
  input:      'persona-request.json',
  output:     'credentials-response.json',
  title:      'Get TaskCluster credentials given a Persona assertion',
  stability:  API.stability.experimental,
  description: [
    "Given an [assertion](https://developer.mozilla.org/en-US/Persona/" +
    "Quick_setup), return an appropriate set of temporary credentials.",
    "",
    "The supplied audience must be on a whitelist of TaskCluster-related",
    "sites configured in the login service.  This is not a general-purpose",
    "assertion-verification service!",
  ].join('\n')
}, async function(req, res) {
  // verify the assertion with the persona service
  let email;
  try {
    email = await this.personaVerifier.verify(req.body.assertion, req.body.audience);
  } catch(err) {
    // translate PersonaErrors into 400's; everything else is a 500
    if (err.code == "PersonaError") {
      res.reportError('InputError', err.message, err);
    }
    throw err;
  }

  // create and authorize a User
  let user = new User();
  user.identity = 'persona/' + email;
  this.authorizer.authorize(user);

  // create and return temporary credentials
  let credentials = user.createCredentials(this.temporaryCredentials);
  return res.reply(credentials);
});

api.declare({
  method: 'get',
  route: '/ping',
  name: 'ping',
  title: 'Ping Server',
  stability:  API.stability.experimental,
  description: [
    'Documented later...',
    '',
    '**Warning** this api end-point is **not stable**.',
  ].join('\n'),
}, function (req, res) {
  res.status(200).json({
    alive: true,
    uptime: process.uptime(),
  });
});

