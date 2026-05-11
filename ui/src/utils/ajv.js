import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { jsonSchemaDraft06 } from './jsonSchemaMetaSchemas.js';
import urls from './urls.js';

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
