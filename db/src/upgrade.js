import { schema } from './schema.js';
import { Database } from 'taskcluster-lib-postgres';

export const upgrade = async ({ adminDbUrl, showProgress, usernamePrefix, toVersion, useDbDirectory }) => {
  await Database.upgrade({
    schema: schema({ useDbDirectory }),
    showProgress,
    usernamePrefix,
    adminDbUrl,
    toVersion,
  });
};

export const downgrade = async ({ adminDbUrl, showProgress, usernamePrefix, toVersion, useDbDirectory }) => {
  await Database.downgrade({
    schema: schema({ useDbDirectory }),
    showProgress,
    usernamePrefix,
    adminDbUrl,
    toVersion,
  });
};
