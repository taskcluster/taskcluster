import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import taskcluster from '@taskcluster/client';
import jsonSchemaDraft06 from 'ajv/lib/refs/json-schema-draft-06.json' with { type: 'json' };

const __dirname = new URL('.', import.meta.url).pathname;

const registeredClientsSchema = yaml.load(
  fs.readFileSync(path.join(__dirname, '../schemas/v1/registered-clients.yml'), 'utf8')
);

const ajv = new Ajv.default({ allErrors: true });
// the schema declares the taskcluster metaschema, which is just a reference to draft-06
ajv.addMetaSchema(jsonSchemaDraft06, '/schemas/common/metaschema.json#');
const validateRegisteredClientsSchema = ajv.compile(registeredClientsSchema);

const schemaErrors = () =>
  validateRegisteredClientsSchema.errors.map(({ instancePath, message, params }) => {
    const property = params.additionalProperty ? ` (${params.additionalProperty})` : '';
    return `${instancePath || '/'} ${message}${property}`;
  });

// JSON Schema cannot express either of these rules. `fromNow` accepts durations
// only in `y mo w d h m s` order, and silently returns a date that is
// not in the future for empty values, which would issue
// credentials to this client that have already expired.
const maxExpiresErrors = clients => {
  const now = new Date();

  return clients.flatMap(({ maxExpires }, index) => {
    let expires;

    try {
      expires = taskcluster.fromNow(maxExpires, now);
    } catch {
      return [`/${index}/maxExpires is not a valid duration (${JSON.stringify(maxExpires)})`];
    }

    return expires > now ? [] : [`/${index}/maxExpires must be a positive duration (${JSON.stringify(maxExpires)})`];
  });
};

const duplicateClientIdErrors = clients => {
  const firstSeenAt = new Map();

  return clients.flatMap(({ clientId }, index) => {
    if (!firstSeenAt.has(clientId)) {
      firstSeenAt.set(clientId, index);
      return [];
    }

    return [`/${index}/clientId duplicates /${firstSeenAt.get(clientId)}/clientId (${clientId})`];
  });
};

export const validateRegisteredClients = clients => {
  if (clients == null) {
    return;
  }

  // the remaining checks assume the configuration is structurally valid
  const errors = validateRegisteredClientsSchema(clients)
    ? [...maxExpiresErrors(clients), ...duplicateClientIdErrors(clients)]
    : schemaErrors();

  if (errors.length) {
    throw new TypeError(`Invalid registeredClients configuration: ${errors.join('; ')}`);
  }
};
