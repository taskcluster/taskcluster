import { schema } from './schema.js';
import { Database } from 'taskcluster-lib-postgres';

/** @typedef {import('taskcluster-lib-postgres').UpgradeOptions} UpgradeOptions */
/** @typedef {import('taskcluster-lib-postgres').DowngradeOptions} DowngradeOptions */
/** @typedef {{ useDbDirectory?: boolean }} SchemaLoadOptions */

/** @param {Omit<UpgradeOptions, 'schema'> & SchemaLoadOptions} options */
export const upgrade = async ({ adminDbUrl, showProgress, usernamePrefix, toVersion, useDbDirectory }) => {
  await Database.upgrade({
    schema: schema({ useDbDirectory }),
    showProgress,
    usernamePrefix,
    adminDbUrl,
    toVersion,
  });
};

/** @param {Omit<DowngradeOptions, 'schema'> & SchemaLoadOptions} options */
export const downgrade = async ({ adminDbUrl, showProgress, usernamePrefix, toVersion, useDbDirectory }) => {
  await Database.downgrade({
    schema: schema({ useDbDirectory }),
    showProgress,
    usernamePrefix,
    adminDbUrl,
    toVersion,
  });
};
