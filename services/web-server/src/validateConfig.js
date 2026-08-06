import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import jsonSchemaDraft06 from 'ajv/lib/refs/json-schema-draft-06.json' with { type: 'json' };

const __dirname = new URL('.', import.meta.url).pathname;

const registeredClientsSchema = yaml.load(
  fs.readFileSync(path.join(__dirname, '../schemas/v1/registered-clients.yml'), 'utf8')
);

const ajv = new Ajv.default({ allErrors: true });
// the schema declares the taskcluster metaschema, which is just a reference to draft-06
ajv.addMetaSchema(jsonSchemaDraft06, '/schemas/common/metaschema.json#');
const validateRegisteredClientsSchema = ajv.compile(registeredClientsSchema);

export const validateRegisteredClients = clients => {
  if (clients == null || validateRegisteredClientsSchema(clients)) {
    return;
  }

  const details = validateRegisteredClientsSchema.errors
    .map(({ instancePath, message, params }) => {
      const property = params.additionalProperty ? ` (${params.additionalProperty})` : '';
      return `${instancePath || '/'} ${message}${property}`;
    })
    .join('; ');

  throw new TypeError(`Invalid registeredClients configuration: ${details}`);
};
