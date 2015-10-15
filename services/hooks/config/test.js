module.exports = {
  hooks:
  {
    publishMetaData:  'false',
    hookTableName:    'TestHooks',
    groupsTableName:  'TestGroups',
    schedule:
    {
      pollingDelay: 1
    }
  },

  taskcluster:
  {
    authBaseUrl:      'http://localhost:60407/v1',
    credentials:
    {
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
