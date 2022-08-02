import urls from 'taskcluster-lib-urls';
import ajv from './ajv';

const schemas = {};
const fetchSchema = async (service, schema) => {
  const res = await fetch(urls.schema('', service, schema));

  return res.json();
};

const prefetch = async () => {
  ajv.addSchema(await fetchSchema('common', 'metaschema.json'));
  ajv.addSchema(await fetchSchema('queue', 'v1/task.json'));
  ajv.addSchema(await fetchSchema('queue', 'v1/task-metadata.json'));
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

  if (!schemas['create-task']) {
    schemas['create-task'] = await fetchSchema(
      'queue',
      'v1/create-task-request.json'
    );
  }

  const errors = [];
  const taskValidation = ajv.validate(schemas['create-task'], value);

  if (!taskValidation) {
    (ajv.errors || []).forEach(error => {
      errors.push(`Task ${formatErrorDetails(error)}`);
    });
  }

  // allow to validate create task payload only when schema is not provided
  if (service && schema) {
    if (!schemas[schema]) {
      schemas[schema] = await fetchSchema(service, schema);
    }

    const validation = ajv.validate(schemas[schema], value.payload);

    if (!validation) {
      (ajv.errors || []).forEach(error => {
        errors.push(`Payload ${formatErrorDetails(error)}`);
      });
    }
  }

  return errors;
};
