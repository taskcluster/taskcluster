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

  /* TODO: rewrite these in-place

  for (const [service, cfg] of Object.entries(configTmpl)) {
    if (cfg.azure_crypto_key && !userConfig[service].azure_crypto_key) {
      userConfig[service].azure_crypto_key = Buffer.from((slugid.v4() + slugid.v4()).slice(0, 32)).toString('base64');
      userConfig[service].azure_signing_key = slugid.v4() + slugid.v4();
    }
  }
  */

  return userConfig;
};

module.exports = {
  azureResources,
};
