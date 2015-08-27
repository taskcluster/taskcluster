module.exports = {
  hooks:
  {
    publishMetaData:  'false',
    hookTableName:    'TestHooks',
    groupsTableName:  'TestGroups'
  },

  taskcluster:
  {
    authBaseUrl:      'http://localhost:60407/v1',
    credentials:
    {
      clientId:       "test-server",
      accessToken:    "none"
    }
  },

  server:
  {
    publicUrl:        'http://localhost:60401',
    port:             60401
  }
};
