import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * Build a validator for a hook's `triggerSchema`, mirroring the Hooks service's
 * `validateTriggerPayload` (services/hooks/src/trigger-schema.js) so the
 * debugger's rejection text matches what the server logs. Returns
 * `{ validate, schemaError }`: when the schema compiles, `validate(payload)`
 * returns `null` on success or the ajv `errorsText` on failure; when the schema
 * itself is invalid, `validate` is `null` and `schemaError` holds the message.
 *
 * A fresh Ajv instance is used per schema so arbitrary user-supplied schemas do
 * not pollute the shared `ui/src/utils/ajv.js` singleton.
 */
const buildTriggerSchemaValidator = triggerSchema => {
  const ajv = new Ajv({
    validateFormats: true,
    verbose: true,
    allErrors: true,
  });

  addFormats(ajv);

  let validateFn;

  try {
    validateFn = ajv.compile(triggerSchema);
  } catch (err) {
    return { validate: null, schemaError: err.message };
  }

  return {
    validate: payload =>
      validateFn(payload)
        ? null
        : ajv.errorsText(validateFn.errors, { separator: '; ' }),
    schemaError: null,
  };
};

export default buildTriggerSchemaValidator;
export { buildTriggerSchemaValidator };
