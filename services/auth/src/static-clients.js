const assert = require('assert');
const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const staticScopes = require('./static-scopes.json');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');

/**
 * Ensure static clients exist and remove all clients prefixed 'static/', if not
 * in the clients given here.
 *
 * Each client is given by an object:
 *         {clientId, accessToken, description, scopes}
 * , where description will be amended with a section explaining that this
 * client is static and can't be modified at runtime.
 */
exports.syncStaticClients = async function(db, clients = []) {
  // Validate input for sanity (we hardly need perfect validation here...)
  assert(clients instanceof Array, 'Expected clients to be am array');
  for (const client of clients) {
    assert(typeof client.clientId === 'string', 'expected clientId to be a string');
    assert(typeof client.accessToken === 'string', 'expected accessToken to be a string');
    assert(client.accessToken.length >= 22, 'accessToken must have at least 22 chars');
    assert(client.accessToken.length <= 66, 'accessToken must have at most 66 chars');
    assert(client.clientId.startsWith('static/'), 'static clients must have clientId = "static/..."');
    if (client.clientId.startsWith('static/taskcluster')) {
      assert(!client.scopes, 'scopes are not allowed in configuration for static/taskcluster clients');
    } else {
      assert(client.scopes instanceof Array, 'expected scopes to be an array of strings');
      assert(typeof client.description === 'string', 'expected description to be a string');
      assert(client.scopes.every(s => typeof s === 'string'), 'scopes must be strings');
    }
  }

  // check that we have all of the expected static/taskcluster clients, and no more.  The staticClients
  // are generated from `services/*/scopes.yml` for all of the other services.
  const seenTCClients = clients
    .map(({ clientId }) => clientId)
    .filter(c => c.startsWith('static/taskcluster/'));
  const expectedTCClients = staticScopes
    .map(({ clientId }) => clientId);
  const extraTCClients = _.difference(seenTCClients, expectedTCClients);
  const missingTCClients = _.difference(expectedTCClients, seenTCClients);

  if (extraTCClients.length > 0 || missingTCClients.length > 0) {
    let msg = 'Incorrect `static/taskcluster` static clients in STATIC_CLIENTS';
    if (extraTCClients.length > 0) {
      msg = msg + `; extra clients ${JSON.stringify(extraTCClients)}`;
    }
    if (missingTCClients.length > 0) {
      msg = msg + `; missing clients ${JSON.stringify(missingTCClients)}`;
    }
    throw new Error(msg);
  }

  // put the configured scopes into place
  clients = clients.map(client => {
    if (client.clientId.startsWith('static/taskcluster/')) {
      const { scopes } = _.find(staticScopes, { clientId: client.clientId });
      return { ...client, description: 'Internal client', scopes };
    } else {
      return client;
    }
  });

  // description suffix to use for all static clients
  const descriptionSuffix = [
    '\n---\n',
    'This is a **static client** inserted into this taskcluster deployment',
    'through static configuration. To modify this client you must contact the',
    'administrator who deploys this taskcluster instance.',
  ].join('\n');

  // Scan table to remove/modify entries that are out of date.  This fetches all
  // static clients, as that number should be small and anyway we are handling them
  // all in memory.
  const done = []; // list of clientIds we've already synchronized
  const rows = await db.fns.get_clients('static/', null, null);

  for (let row of rows) {
    // Find target we should modify the client match
    const target = clients.find(c => c.clientId === row.client_id);
    // If client doesn't exist we delete it
    if (!target) {
      await db.fns.delete_client(row.client_id);
      continue;
    }

    // Ensure that client looks the way it should
    let needsUpdate = false;
    if (db.decrypt({ value: row.encrypted_access_token }).toString('utf8') !== target.accessToken) {
      needsUpdate = true;
    } else if (!_.isEqual(row.scopes, target.scopes)) {
      needsUpdate = true;
    } else if (row.description !== target.description + descriptionSuffix) {
      needsUpdate = true;
    }
    if (needsUpdate) {
      await db.fns.update_client(
        row.client_id,
        target.description + descriptionSuffix,
        db.encrypt({ value: Buffer.from(target.accessToken, 'utf8') }),
        null, // expires
        null, // disabled
        JSON.stringify(target.scopes),
        null, // delete_on_expiration
      );
    }

    // note that we've sync'ed this clientId
    done.push(row.client_id);
  }

  // Find clients that we haven't seen yet
  const newClients = clients.filter(c => !done.includes(c.clientId));

  // Create new clients
  for (let target of newClients) {
    try {
      await db.fns.create_client(
        target.clientId,
        target.description + descriptionSuffix,
        db.encrypt({ value: Buffer.from(target.accessToken, 'utf8') }),
        taskcluster.fromNow('1000 year'), // expires never, basically
        false, // not disabled
        JSON.stringify(target.scopes),
        false, // do not delete on expiration
      );
    } catch (err) {
      // when lots of instances of this service start at once, conflict is not
      // unlikely here.  We'll assume that, if a UNIQUE_VIOLATION occurred,
      // another process has made roughly the same update we just did.
      if (err.code === UNIQUE_VIOLATION) {
        continue;
      }
      throw err;
    }
  }
};
