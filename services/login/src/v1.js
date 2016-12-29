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
  ].join('\n'),
  schemaPrefix:  'http://schemas.taskcluster.net/login/v1/',
  context: ['authorizer', 'temporaryCredentials'],
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

