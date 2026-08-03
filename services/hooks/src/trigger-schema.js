import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export const validateTriggerPayload = (triggerSchema, payload) => {
  const ajv = new Ajv.default({ validateFormats: true, verbose: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(triggerSchema);
  return validate(payload) ? null : ajv.errorsText(validate.errors, { separator: '; ' });
};
