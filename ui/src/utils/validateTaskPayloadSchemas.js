import ajv from './ajv.js';

const prefetch = async () => {
  // metaschema needs to be loaded first as other schemas depend on it
  await ajv.loadServiceSchema('common', 'metaschema.json');
  await Promise.all([
    ajv.loadServiceSchema('queue', 'v1/task.json'),
    ajv.loadServiceSchema('queue', 'v1/task-metadata.json'),
    ajv.loadServiceSchema(
      'queue',
      'v1/create-task-request.json',
      'create-task'
    ),
  ]);
};

const prefetchPromise = prefetch();

export const formatErrorDetails = error => {
  const msg = [error.message];

  if (error.keyword === 'type') {
    msg.push(`'${error.instancePath}'`);
  } else if (error.keyword === 'additionalProperties') {
    msg.push(`'${error.params.additionalProperty}'`);
  }

  return msg.join(' ');
};

export default async (value, service, schema) => {
  await prefetchPromise;

  const errors = [];
  const taskValidation = ajv.validate('create-task', value);

  if (!taskValidation) {
    (ajv.errors || []).forEach(error => {
      errors.push(`Task ${formatErrorDetails(error)}`);
    });
  }

  // allow to validate create task payload only when schema is not provided
  if (service && schema) {
    const doc = await ajv.loadServiceSchema(service, schema);
    const validation = ajv.validate(doc.$id, value.payload);

    if (!validation) {
      (ajv.errors || []).forEach(error => {
        errors.push(`Payload ${formatErrorDetails(error)}`);
      });
    }
  }

  return errors;
};
