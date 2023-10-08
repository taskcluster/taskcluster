import * as helper from './helper.js';
import assert from 'assert';
import jwt from 'jsonwebtoken';
import testing from 'taskcluster-lib-testing';

helper.secrets.mockSuite(testing.suiteName(), ['azure', 'gcp'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withCfg(mock, skipping);
  helper.withPulse(mock, skipping);
  const servers = helper.withServers(mock, skipping);
  helper.resetTables(mock, skipping);

  test('websocktunnelToken', async () => {
    const wstAudience = 'websocktunnel-usw2';
    const wstClient = 'my-group-my-id';
    const resp = await servers.apiClient.websocktunnelToken(wstAudience, wstClient);

    assert.equal(resp.wstClient, wstClient);
    assert.equal(resp.wstAudience, wstAudience);
    assert(new Date(resp.expires) > new Date());

    const decoded = jwt.verify(resp.token, 'test-secret', { algorithms: ['HS256'] });

    assert.ok(decoded);
    assert.equal(decoded.tid, wstClient);
    assert.equal(decoded.aud, wstAudience);
    assert.equal(decoded.sub, 'static/taskcluster/root');
    assert(new Date(decoded.iat * 1000) <= new Date());
    assert(new Date(decoded.exp * 1000) > new Date());
    assert(new Date(decoded.nbf * 1000) < new Date());
    assert.equal(decoded.iss, 'taskcluster-auth');
  });
});
