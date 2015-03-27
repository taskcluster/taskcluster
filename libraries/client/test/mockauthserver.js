var base            = require('taskcluster-base');

base.testing.createMockAuthServer({
  port:     62351,
  clients: [
    {
      clientId:     'test-client',
      accessToken:  'test-token',
      scopes:       ['auth:credentials'],
      expires:      new Date(2092, 0, 0, 0, 0, 0, 0)
    }
  ]
});
