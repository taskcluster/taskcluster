import { schema } from './schema.js';
import { Database } from 'taskcluster-lib-postgres';

/** @param {import('taskcluster-lib-postgres').SetupOptions & { useDbDirectory?: boolean }} options */
export const setup = async ({ writeDbUrl, readDbUrl, serviceName, useDbDirectory,
  statementTimeout, poolSize, monitor, azureCryptoKey, dbCryptoKeys }) => {
  return await Database.setup({
    schema: schema({ useDbDirectory }),
    writeDbUrl,
    readDbUrl,
    serviceName,
    statementTimeout,
    poolSize,
    monitor,
    azureCryptoKey,
    dbCryptoKeys,
  });
};
