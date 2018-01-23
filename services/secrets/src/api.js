const API = require('taskcluster-lib-api');
const slugid = require('slugid');
const _ = require('lodash');

let SCHEMA_PREFIX_CONST = 'http://schemas.taskcluster.net/secrets/v1/';

/** API end-point for version v1/
 *
 */
let api = new API({
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
});

// Export API
module.exports = api;

let cleanPayload = payload => {
  payload.secret = '(OMITTED)';
  return payload;
};

api.declare({
  method:      'put',
  route:       '/secret/:name(*)',
  name:        'set',
  input:       SCHEMA_PREFIX_CONST + 'secret.json#',
  scopes:      [['secrets:set:<name>']],
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
    await this.entity.create({
      name:       name,
      secret:     secret,
      expires:    new Date(expires),
    });
  } catch (e) {
    // If the entity exists, update it
    if (e.name == 'EntityAlreadyExistsError') {
      let item = await this.entity.load({name});
      await item.modify(function() {
        this.secret = secret;
        this.expires = new Date(expires);
      });
    }
  }
  res.reply({});
});

api.declare({
  method:      'delete',
  route:       '/secret/:name(*)',
  name:        'remove',
  scopes:      [['secrets:set:<name>']],
  title:       'Delete Secret',
  stability:    'stable',
  description: [
    'Delete the secret associated with some key.',
  ].join('\n'),
}, async function(req, res) {
  let {name} = req.params;
  try {
    await this.entity.remove({name: name});
  } catch (e) {
    if (e.name == 'ResourceNotFoundError') {
      return res.reportError('ResourceNotFound', 'Secret not found', {});
    } else {
      throw e;
    }
  }
  res.reply({});
});

api.declare({
  method:      'get',
  route:       '/secret/:name(*)',
  name:        'get',
  output:      SCHEMA_PREFIX_CONST + 'secret.json#',
  scopes:      [['secrets:get:<name>']],
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
    item = await this.entity.load({name});
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

api.declare({
  method:      'get',
  route:       '/secrets',
  deferAuth:   true,
  name:        'list',
  output:      SCHEMA_PREFIX_CONST + 'secret-list.json#',
  title:       'List Secrets',
  stability:    'stable',
  query: {
    continuationToken: /./,
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
  const query = await this.entity.scan({}, {continuation, limit});

  return res.reply({
    secrets: query.entries.map(secret => secret.name),
    continuationToken: query.continuation || undefined,
  });
});
