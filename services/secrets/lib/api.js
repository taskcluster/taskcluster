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
    "The secrets service, typically available at",
    "`tools.taskcluster.net`, is responsible for managing",
    "secure data in TaskCluster."
  ].join('\n')
});

// Export API
module.exports = api;

api.declare({
  method:      'put',
  route:       '/secrets/:name(*)',
  deferAuth:   true,
  name:        'set',
  input:       common.SCHEMA_PREFIX_CONST + "secret.json#",
  scopes:      [['secrets:set:<name>']],
  title:       'Create New Secret',
  description: 'Set a secret associated with some key.'
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
      // If they're trying to re-apply the same secret just respond with okay
      if (e.name == 'EntityAlreadyExistsError') {
        let item = await this.entity.load({name});
        if (!_.isEqual(item.secret, secret) ||
            !_.isEqual(new Date(item.expires), new Date(expires))) {
            res.status(e.statusCode).send(`A resource named ${name} already exists.`);
            return;
        }
      } else {
        throw e;
      }
    }
    res.status(204).send();
});

api.declare({
  method:      'post',
  route:       '/secrets/:name(*)',
  deferAuth:   true,
  name:        'update',
  input:       common.SCHEMA_PREFIX_CONST + "secret.json#",
  scopes:      [['secrets:update:<name>']],
  title:       'Update A Secret',
  description: 'Update a secret associated with some key.'
}, async function(req, res) {
    let {secret, expires} = req.body;
    let {name} = req.params;
    if (!req.satisfies({name})) {
      return;
    }
    let item = await this.entity.load({name}, true);
    if (!item) {
      res.status(404).send(`Can't update, no resource named ${name} found`);
      return;
    }
    await item.modify(function() {
      this.secret = secret;
      this.expires = new Date(expires);
    });
    res.status(204).send();
});

api.declare({
  method:      'delete',
  route:       '/secrets/:name(*)',
  deferAuth:   true,
  name:        'remove',
  scopes:      [['secrets:remove:<name>']],
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
      res.status(404).send(`Can't delete, no resource named ${name} found`);
      return;
    } else {
      throw e;
    }
  }
  res.status(204).send();
});

api.declare({
  method:      'get',
  route:       '/secrets/:name(*)',
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
      res.status(404).send(`No resource named ${name} found`);
      return;
    } else {
      throw e;
    }
  }
  if (item.isExpired()) {
    res.status(410).send('The requested resource has expired.');
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
