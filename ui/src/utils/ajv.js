import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import urls from './urls.js';

// AJV v8 includes meta-schemas (draft-06, draft-07) by default
// so we don't need to manually import and add them
const ajv = new Ajv({ validateFormats: true, verbose: true, allErrors: true });

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
