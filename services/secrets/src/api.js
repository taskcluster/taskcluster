import _ from 'lodash';
import { APIBuilder, paginateResults } from '@taskcluster/lib-api';

export const AUDIT_ENTRY_TYPE = Object.freeze({
  SECRET: {
    CREATED: 'created',
    UPDATED: 'updated',
    DELETED: 'deleted',
    EXPIRED: 'expired',
  },
});
const secretToJson = (db, item) => ({
  secret: _.cloneDeep(JSON.parse(db.decrypt({ value: item.encrypted_secret }).toString('utf8'))),
  expires: item.expires.toJSON(),
});

/** API end-point for version v1/
 *
 */
let builder = new APIBuilder({
  title: 'Secrets Service',
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
  apiVersion: 'v1',
  context: ['cfg', 'db', 'monitor'],
});

// Export API
export default builder;

let cleanPayload = payload => {
  payload.secret = '(OMITTED)';
  return payload;
};

builder.declare({
  method: 'put',
  route: '/secret/:name(*)',
  name: 'set',
  input: 'secret.yml',
  scopes: 'secrets:set:<name>',
  title: 'Set Secret',
  stability: 'stable',
  category: 'Secrets Service',
  cleanPayload,
  description: [
    'Set the secret associated with some key.  If the secret already exists, it is',
    'updated instead.',
  ].join('\n'),
}, async function(req, res) {
  const { name } = req.params;
  const { secret, expires } = req.body;

  const [item] = await this.db.fns.get_secret(name);

  await this.db.fns.upsert_secret(name, this.db.encrypt({
    value: Buffer.from(JSON.stringify(secret), 'utf8'),
  }), new Date(expires));

  this.monitor.log.auditEvent({
    service: 'secrets',
    entity: 'secret',
    entityId: name,
    clientId: await req.clientId(),
    action: item === undefined ? AUDIT_ENTRY_TYPE.SECRET.CREATED : AUDIT_ENTRY_TYPE.SECRET.UPDATED,
  });

  await this.db.fns.insert_secrets_audit_history(
    name,
    await req.clientId(),
    item === undefined ? AUDIT_ENTRY_TYPE.SECRET.CREATED : AUDIT_ENTRY_TYPE.SECRET.UPDATED,
  );

  res.reply({});
});

builder.declare({
  method: 'delete',
  route: '/secret/:name(*)',
  name: 'remove',
  scopes: 'secrets:set:<name>',
  title: 'Delete Secret',
  stability: 'stable',
  category: 'Secrets Service',
  description: [
    'Delete the secret associated with some key. It will succeed whether or not the secret exists',
  ].join('\n'),
}, async function(req, res) {
  const { name } = req.params;

  await this.db.fns.delete_secret(name);

  this.monitor.log.auditEvent({
    service: 'secrets',
    entity: 'secret',
    entityId: name,
    clientId: await req.clientId(),
    action: AUDIT_ENTRY_TYPE.SECRET.DELETED,
  });

  await this.db.fns.insert_secrets_audit_history(
    name,
    await req.clientId(),
    AUDIT_ENTRY_TYPE.SECRET.DELETED,
  );

  res.reply({});
});

builder.declare({
  method: 'get',
  route: '/secret/:name(*)',
  name: 'get',
  output: 'secret.yml',
  scopes: 'secrets:get:<name>',
  title: 'Read Secret',
  stability: 'stable',
  category: 'Secrets Service',
  description: [
    'Read the secret associated with some key.  If the secret has recently',
    'expired, the response code 410 is returned.  If the caller lacks the',
    'scope necessary to get the secret, the call will fail with a 403 code',
    'regardless of whether the secret exists.',
  ].join('\n'),
}, async function(req, res) {
  const { name } = req.params;
  const [item] = await this.db.fns.get_secret(name);
  if (item === undefined) {
    return res.reportError('ResourceNotFound', 'Secret not found', {});
  }
  return res.reply(secretToJson(this.db, item));
});

builder.declare({
  method: 'get',
  route: '/secrets',
  name: 'list',
  scopes: 'secrets:list-secrets',
  output: 'secret-list.yml',
  title: 'List Secrets',
  stability: 'stable',
  category: 'Secrets Service',
  query: paginateResults.query,
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
  const { continuationToken, rows: secrets } = await paginateResults({
    query: req.query,
    fetch: (size, offset) => this.db.fns.get_secrets(
      size,
      offset,
    ),
  });

  return res.reply({
    secrets: secrets.map(secret => secret.name),
    continuationToken,
  });
});

builder.declare({
  method: 'get',
  route: '/__heartbeat__',
  name: 'heartbeat',
  scopes: null,
  category: 'Monitoring',
  stability: 'stable',
  title: 'Heartbeat',
  description: [
    'Respond with a service heartbeat.',
    '',
    'This endpoint is used to check on backing services this service',
    'depends on.',
  ].join('\n'),
}, function(_req, res) {
  // TODO: add implementation
  res.reply({});
});
