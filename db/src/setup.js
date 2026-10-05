import { schema } from './schema.js';
import { Database } from '@taskcluster/lib-postgres';

/** @param {import('@taskcluster/lib-postgres').SetupOptions & { useDbDirectory?: boolean }} options */
export const setup = async ({ useDbDirectory, ...options }) => {
  return await Database.setup({ ...options, schema: schema({ useDbDirectory }) });
};
