import { schema } from 'taskcluster-lib-urls';
import ajv from './ajv';

let actionsJsonSchemaResponse = null;
let validateActionsJson = null;

export default async () => {
  if (!validateActionsJson) {
    actionsJsonSchemaResponse = await fetch(
      schema(
        `https://${process.env.TASKCLUSTER_ROOT_URL}`,
        'common',
        'action-schema-v1.json'
      )
    );

    validateActionsJson = ajv.compile(await actionsJsonSchemaResponse.json());
  }

  return validateActionsJson;
};
