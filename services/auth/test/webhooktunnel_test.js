const helper = require('./helper');
const assert = require('assert');
const jwt = require('jsonwebtoken');

helper.secrets.mockSuite(helper.suiteName(__filename), ['app', 'azure'], function(mock, skipping) {
  helper.withPulse(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withRoles(mock, skipping);
  helper.withServers(mock, skipping);

  test('websocktunnelToken', async () => {
    let {tunnelId, token, proxyUrl} = await helper.apiClient.websocktunnelToken();
    let decoded = jwt.verify(token, 'test-secret');

    assert(decoded !== null);
    assert(decoded.tid === tunnelId);
    assert(decoded.sub === 'static/taskcluster/root');
  });
});
