import base from 'taskcluster-base';
import common from './common';
import slugid from 'slugid';
import _ from 'lodash';


/** API end-point for version v1/
 *
 * In this API implementation we shall assume the following context:
 * {
 *   publisher:      // publisher from base.Exchanges
 * }
 */
var api = new base.API({
  title:        "TaskCluster Secrets API Documentation",
  description: [
    "The secrets service, is a simple key/value store for secret data",
    "guarded by TaskCluster scopes.  It is typically available at",
    "`secrets.taskcluster.net`."
  ].join('\n')
});

// Export API
module.exports = api;

api.declare({
  method:      'put',
  route:       '/secret/:name(*)',
  deferAuth:   true,
  name:        'set',
  input:       common.SCHEMA_PREFIX_CONST + "secret.json#",
  scopes:      [['secrets:set:<name>']],
  title:       'Create Secret',
  description: 'Set a secret associated with some key.  If the secret already exists, it is updated instead.'
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
  description: 'Delete the secret attached to some key.'
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
  output:      common.SCHEMA_PREFIX_CONST + "secret.json#",
  scopes:      [['secrets:get:<name>']],
  title:       'Read Secret',
  description: 'Read the secret attached to some key.'
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
  output:      common.SCHEMA_PREFIX_CONST + "secret-list.json#",
  title:       'List Secrets',
  description: 'List the names of all visible secrets.'
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

/** Check that the server is a alive */
api.declare({
  method:   'get',
  route:    '/ping',
  name:     'ping',
  title:    "Ping Server",
  description: [
    "Documented later...",
    "",
    "**Warning** this api end-point is **not stable**."
  ].join('\n')
}, function(req, res) {

  res.status(200).json({
    alive:    true,
    uptime:   process.uptime()
  });
});
