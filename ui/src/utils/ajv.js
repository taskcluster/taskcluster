import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import metaSchema from 'ajv/lib/refs/json-schema-draft-06.json';

const ajv = new Ajv({ validateFormats: true, verbose: true, allErrors: true });

addFormats(ajv);
ajv.addMetaSchema(metaSchema);

ajv.addSchemaOnce = (schema, key) => {
  const uniqueKey = key || schema.$id;

  if (!ajv.getSchema(uniqueKey)) {
    ajv.addSchema(schema, uniqueKey);
  }
};

export default ajv;
