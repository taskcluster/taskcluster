const taskcluster = require('taskcluster-client');

/**
 * Generate a `credentials` property for azure-entities or azure-blob-storage,
 * that will fetch SAS credentials from the Auth service.
 */
exports.sasCredentials = ({accountId, tableName, rootUrl, credentials, accessLevel}) => {
  const auth = new taskcluster.Auth({rootUrl, credentials});
  return {
    accountId,
    sas: () => auth.azureTableSAS(accountId, tableName, accessLevel || 'read-write')
      .then(res => res.sas),
    minSASAuthExpiry: 15 * 60 * 1000,
  };
};
