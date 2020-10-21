const azureResources = async ({ userConfig, answer, configTmpl }) => {
  // this exists only to drop now-unused Azure bits
  if (userConfig.auth) {
    delete userConfig.auth.azure_account_key;
    // note that auth.azure_accounts is retained
  }

  if (userConfig.queue) {
    delete userConfig.queue.azure_account_key;
  }

  delete userConfig.azureAccountId;

  return userConfig;
};

module.exports = {
  azureResources,
};
