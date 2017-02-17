import API from 'taskcluster-lib-api';
import slugid from 'slugid';
import _ from 'lodash';

let SCHEMA_PREFIX_CONST = 'http://schemas.taskcluster.net/secrets/v1/';

/** API end-point for version v1/
 *
 */
let api = new API({
  title:        "TaskCluster Secrets API Documentation",
  description: [
    "The secrets service provides a simple key/value store for small bits of secret",
    "data.  Access is limited by scopes, so values can be considered secret from",
    "those who do not have the relevant scopes.",
    "",
    "Secrets also have an expiration date, and once a secret has expired it can no",
    "longer be read.  This is useful for short-term secrets such as a temporary",
    "service credential or a one-time signing key.",
  ].join('\n')
});

// Export API
module.exports = api;

api.declare({
  method:      'put',
  route:       '/secret/:name(*)',
  deferAuth:   true,
  name:        'set',
  input:       SCHEMA_PREFIX_CONST + "secret.json#",
  scopes:      [['secrets:set:<name>']],
  title:       'Set Secret',
  stability:    'stable',
  cleanPayload: payload => ({...payload, secret: "(OMITTED)"}),
  description: [
    "Set the secret associated with some key.  If the secret already exists, it is",
    "updated instead."
  ].join('\n')
}, async function(req, res) {
    let {name} = req.params;
    let {secret, expires} = req.body;
    if (!req.satisfies({name})) {
      return;
    }
    try {
      await this.entity.create({
        name:       name,
        secret:     secret,
        expires:    new Date(expires)
      });
    } catch(e) {
      // If the entity exists, update it
      if (e.name == 'EntityAlreadyExistsError') {
        let item = await this.entity.load({name});
        await item.modify(function() {
          this.secret = secret;
          this.expires = new Date(expires);
        });
      }
    }
    res.status(200).json({});
});

api.declare({
  method:      'delete',
  route:       '/secret/:name(*)',
  deferAuth:   true,
  name:        'remove',
  scopes:      [['secrets:set:<name>']],
  title:       'Delete Secret',
  stability:    'stable',
  description: [
    "Delete the secret associated with some key.",
  ].join('\n')
}, async function(req, res) {
  let {name} = req.params;
  if (!req.satisfies({name})) {
    return;
  }
  try {
    await this.entity.remove({name: name});
  } catch(e) {
    if (e.name == 'ResourceNotFoundError') {
      res.status(404).json({
        message: "Secret not found"
      });
      return;
    } else {
      throw e;
    }
  }
  res.status(200).json({});
});

api.declare({
  method:      'get',
  route:       '/secret/:name(*)',
  deferAuth:   true,
  name:        'get',
  output:      SCHEMA_PREFIX_CONST + "secret.json#",
  scopes:      [['secrets:get:<name>']],
  title:       'Read Secret',
  stability:    'stable',
  description: [
    "Read the secret associated with some key.  If the secret has recently",
    "expired, the response code 410 is returned.  If the caller lacks the",
    "scope necessary to get the secret, the call will fail with a 403 code",
    "regardless of whether the secret exists."
  ].join('\n')
}, async function(req, res) {
  let {name} = req.params;
  if (!req.satisfies({name})) {
    return;
  }
  let item = undefined;
  try {
    item = await this.entity.load({name});
  } catch (e) {
    if (e.name == 'ResourceNotFoundError') {
      res.status(404).json({
        message: "Secret not found"
      });
      return;
    } else {
      throw e;
    }
  }
  if (item.isExpired()) {
    res.status(410).json({
      message: 'The requested resource has expired.'
    });
  } else {
    res.status(200).json(item.json());
  }
});

api.declare({
  method:      'get',
  route:       '/secrets',
  deferAuth:   true,
  name:        'list',
  output:      SCHEMA_PREFIX_CONST + "secret-list.json#",
  title:       'List Secrets',
  stability:    'stable',
  description: [
    "List the names of all secrets that you would have access to read. In",
    "other words, secret name `<X>` will only be returned if a) a secret",
    "with name `<X>` exists, and b) you posses the scope `secrets:get:<X>`."
  ].join('\n')
}, async function(req, res) {
  let secrets = [];
  await this.entity.scan({}, {
    handler: (item) => {
      if (req.satisfies([["secrets:get:" + item.name]], true)) {
        secrets.push(item.name);
      }
    }
  });
  return res.reply({secrets});
});
