module.exports = {
  hooks:
  {
    hookTableName: 'amiyaguchi_hooks',
    groupsTableName: 'amiyaguchi_groups'
  },
  server:
  {
    publicUrl: 'http://localhost:60003',
    port:       60003
  },
  taskcluster:
  {
    authBaseUrl: 'http://localhost:60004',
    credentials:
    {
      clientId: "test-server",
      accessToken: "none"
    }
  }
}
