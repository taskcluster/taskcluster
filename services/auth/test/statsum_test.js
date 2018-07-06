const helper = require('./helper');
const assert = require('assert');

helper.secrets.mockSuite(helper.suiteName(__filename), ['app', 'azure'], function(mock, skipping) {
  helper.withPulse(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withRoles(mock, skipping);
  helper.withServers(mock, skipping);

  test('statsumToken', async () => {
    let result = await helper.apiClient.statsumToken('test');

    assert(result.project === 'test');
    assert(result.token);
    assert(result.baseUrl);
    assert(result.expires);
  });
});
