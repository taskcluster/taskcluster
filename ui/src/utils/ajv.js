import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import urls from './urls.js';

import jsonSchemaDraft06Raw from 'ajv/lib/refs/json-schema-draft-06.json?raw';
const jsonSchemaDraft06 = JSON.parse(jsonSchemaDraft06Raw);

const ajv = new Ajv({ validateFormats: true, verbose: true, allErrors: true });
ajv.addMetaSchema(jsonSchemaDraft06);

addFormats(ajv);

const schemaCache = {};
const fetchSchema = async (service, schema) => {
  const url = urls.schema(service, schema);

  if (schemaCache[url]) {
    return schemaCache[url];
  }

  const doc = await (await fetch(url)).json();

  schemaCache[url] = doc;

  return doc;
};

ajv.loadServiceSchema = async (service, schema, alias) => {
  const doc = await fetchSchema(service, schema);

  if (!ajv.getSchema(doc.$id)) {
    ajv.addSchema(doc);
  }

  if (alias && !ajv.getSchema(alias)) {
    ajv.addSchema(doc, alias);
  }

  return doc;
};

export default ajv;
