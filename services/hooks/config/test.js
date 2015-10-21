module.exports = {
  hooks:
  {
    publishMetaData:  'false',
    azureAccount:     'jungle',
    hookTableName:    'TestHooks3',
    tableSigningKey:  'not-a-secret-so-you-cant-guess-it',
    tableCryptoKey:   'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    schedule:
    {
      pollingDelay: 1
    }
  },

  taskcluster:
  {
    authBaseUrl:      'http://localhost:60407/v1',
    // Should have scope: 'auth:azure-table-access:jungle/*'
    credentials: {
      clientId:       undefined,
      accessToken:    undefined
    }
  },

  server:
  {
    publicUrl:        'http://localhost:60401',
    port:             60401
  }
};
