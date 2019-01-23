import ajv from './ajv';
import urls from './urls';

let actionsJsonSchemaResponse;
let validateActionsJson;

export default async () => {
  if (!validateActionsJson) {
    actionsJsonSchemaResponse = await fetch(
      urls.schema('common', 'action-schema-v1.json')
    );

    validateActionsJson = ajv.compile(await actionsJsonSchemaResponse.json());
  }

  return validateActionsJson;
};
