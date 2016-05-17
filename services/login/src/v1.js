var API         = require('taskcluster-lib-api');
var debug       = require('debug')('login:routes:v1');
var _           = require('lodash');

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
  schemaPrefix:  'http://schemas.taskcluster.net/login/v1/'
});

// Export api
module.exports = api;

api.declare({
  method:     'post',
  route:      '/persona',
  name:       'credentialsFromPersonaAssertion',
  idempotent: false,
  output:     'credentials-response.json',
  title:      'Get TaskCluster credentials given a Persona assertion',
  stability:  API.stability.experimental,
  description: [
    "Given an [assertion](https://developer.mozilla.org/en-US/Persona/" +
    "Quick_setup#Step_4_Verify_the_user%E2%80%99s_credentials), return",
    "an appropriate set of temporary credentials.",
  ].join('\n')
}, async function(req, res) {
  return res.status(501).json({error: "not implemented yet"});
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

