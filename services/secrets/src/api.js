const APIBuilder = require('taskcluster-lib-api');
const slugid = require('slugid');
const _ = require('lodash');
const Entity = require('azure-entities');

/** API end-point for version v1/
 *
 */
let builder = new APIBuilder({
  title:        'TaskCluster Secrets API Documentation',
  description: [
    'The secrets service provides a simple key/value store for small bits of secret',
    'data.  Access is limited by scopes, so values can be considered secret from',
    'those who do not have the relevant scopes.',
    '',
    'Secrets also have an expiration date, and once a secret has expired it can no',
    'longer be read.  This is useful for short-term secrets such as a temporary',
    'service credential or a one-time signing key.',
  ].join('\n'),
  serviceName: 'secrets',
  version: 'v1',
  context: ['cfg', 'Secret'],
});

// Export API
module.exports = builder;

let cleanPayload = payload => {
  payload.secret = '(OMITTED)';
  return payload;
};

builder.declare({
  method:      'put',
  route:       '/secret/:name(*)',
  name:        'set',
  input:       'secret.yml',
  scopes:      'secrets:set:<name>',
  title:       'Set Secret',
  stability:    'stable',
  cleanPayload,
  description: [
    'Set the secret associated with some key.  If the secret already exists, it is',
    'updated instead.',
  ].join('\n'),
}, async function(req, res) {
  let {name} = req.params;
  let {secret, expires} = req.body;
  try {
    await this.Secret.create({
      name:       name,
      secret:     secret,
      expires:    new Date(expires),
    });
  } catch (e) {
    // If the entity exists, update it
    if (e.name == 'EntityAlreadyExistsError') {
      let item = await this.Secret.load({name});
      await item.modify(function() {
        this.secret = secret;
        this.expires = new Date(expires);
      });
    } else {
      throw e;
    }
  }
  res.reply({});
});

builder.declare({
  method:      'delete',
  route:       '/secret/:name(*)',
  name:        'remove',
  scopes:      'secrets:set:<name>',
  title:       'Delete Secret',
  stability:    'stable',
  description: [
    'Delete the secret associated with some key.',
  ].join('\n'),
}, async function(req, res) {
  let {name} = req.params;
  try {
    await this.Secret.remove({name: name});
  } catch (e) {
    if (e.name == 'ResourceNotFoundError') {
      return res.reportError('ResourceNotFound', 'Secret not found', {});
    } else {
      throw e;
    }
  }
  res.reply({});
});

builder.declare({
  method:      'get',
  route:       '/secret/:name(*)',
  name:        'get',
  output:      'secret.yml',
  scopes:      'secrets:get:<name>',
  title:       'Read Secret',
  stability:    'stable',
  description: [
    'Read the secret associated with some key.  If the secret has recently',
    'expired, the response code 410 is returned.  If the caller lacks the',
    'scope necessary to get the secret, the call will fail with a 403 code',
    'regardless of whether the secret exists.',
  ].join('\n'),
}, async function(req, res) {
  let {name} = req.params;
  let item = undefined;
  try {
    item = await this.Secret.load({name});
  } catch (e) {
    if (e.name == 'ResourceNotFoundError') {
      return res.reportError('ResourceNotFound', 'Secret not found', {});
    } else {
      throw e;
    }
  }
  if (item.isExpired()) {
    return res.reportError('ResourceExpired', 'The requested resource has expired.', {});
  } else {
    res.reply(item.json());
  }
});

builder.declare({
  method:      'get',
  route:       '/secrets',
  name:        'list',
  output:      'secret-list.yml',
  title:       'List Secrets',
  stability:   'stable',
  query: {
    continuationToken: Entity.continuationTokenPattern,
    limit: /^[0-9]+$/,
  },
  description: [
    'List the names of all secrets.',
    '',
    'By default this end-point will try to return up to 1000 secret names in one',
    'request. But it **may return less**, even if more tasks are available.',
    'It may also return a `continuationToken` even though there are no more',
    'results. However, you can only be sure to have seen all results if you',
    'keep calling `listTaskGroup` with the last `continuationToken` until you',
    'get a result without a `continuationToken`.',
    '',
    'If you are not interested in listing all the members at once, you may',
    'use the query-string option `limit` to return fewer.',
  ].join('\n'),
}, async function(req, res) {
  const continuation = req.query.continuationToken || null;
  const limit = Math.min(parseInt(req.query.limit || 1000, 10), 1000);
  const query = await this.Secret.scan({}, {continuation, limit});

  return res.reply({
    secrets: query.entries.map(secret => secret.name),
    continuationToken: query.continuation || undefined,
  });
});
