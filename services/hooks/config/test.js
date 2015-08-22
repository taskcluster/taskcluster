module.exports = {
  hooks:
  {
    hookTableName: 'amiyaguchihooks',
    groupsTableName: 'amiyaguchigroups'
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
