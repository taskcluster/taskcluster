import Ajv from 'ajv';

export default new Ajv({ format: 'full', verbose: true, allErrors: true });
