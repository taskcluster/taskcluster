const slugid = require('slugid');
const msRestNodeAuth = require('@azure/ms-rest-nodeauth');
const { ResourceManagementClient } = require('@azure/arm-resources');
const { StorageManagementClient } = require('@azure/arm-storage');

const azurePrompts = ({ userConfig, prompts, configTmpl }) => {

  prompts.push({
    when: () => !userConfig.azureAccountId,
    type: 'input',
    name: 'azureAccountId',
    message: 'What is the storage account name in azure?',
    default: previous => (previous.meta || {}).deploymentPrefix || (userConfig.meta || {}).deploymentPrefix,
  });

  prompts.push({
    when: () => !userConfig.meta || !userConfig.meta.azureSubscriptionId,
    type: 'input',
    name: 'meta.azureSubscriptionId',
    message: 'What is the azure subscriptionId?',
  });

  prompts.push({
    when: () => !userConfig.meta || !userConfig.meta.azureRegion,
    type: 'input',
    name: 'meta.azureRegion',
    message: 'Which azure region to use for storage.',
    default: 'East US',
  });
};

const azureResources = async ({ userConfig, answer, configTmpl }) => {
  userConfig.auth = userConfig.auth || {};
  if (!userConfig.auth.azure_account_key || !userConfig.queue.azure_account_key) {
    const resourceGroupName = answer.azureAccountId || userConfig.azureAccountId;
    const location = (answer.meta || {}).azureRegion || (userConfig.meta || {}).azureRegion;
    const creds = await msRestNodeAuth.interactiveLogin();
    const subscriptionId = answer.meta.azureSubscriptionId || userConfig.meta.azureSubscriptionId;

    const resourceClient = new ResourceManagementClient(creds, subscriptionId);

    await resourceClient.resourceGroups.createOrUpdate(resourceGroupName, {
      location,
      tags: {},
    });

    const storageClient = new StorageManagementClient(creds, subscriptionId);
    await storageClient.storageAccounts.create(
      resourceGroupName,
      resourceGroupName,
      {
        sku: {
          name: 'Standard_RAGRS',
        },
        kind: 'Storage',
        location,
        tags: {},
      },
    );
    const accountId = answer.azureAccountId || userConfig.azureAccountId;
    const result = await storageClient.storageAccounts.listKeys(
      accountId,
      resourceGroupName,
    );
    userConfig.auth.azure_account_key = result.keys[0].value;
    userConfig.auth.azure_accounts = {
      [accountId]: result.keys[0].value,
    };

    userConfig.queue.azure_account_key = result.keys[0].value;
    userConfig.queue.azure_table_account_name = accountId;
  }

  for (const [service, cfg] of Object.entries(configTmpl)) {
    if (cfg.azure_crypto_key && !userConfig[service].azure_crypto_key) {
      userConfig[service].azure_crypto_key = Buffer.from((slugid.v4() + slugid.v4()).slice(0, 32)).toString('base64');
      userConfig[service].azure_signing_key = slugid.v4() + slugid.v4();
    }
  }

  return userConfig;
};

module.exports = {
  azurePrompts,
  azureResources,
};
