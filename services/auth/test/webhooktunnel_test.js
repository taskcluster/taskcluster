suite('webhooktunnel', () => {
  let helper = require('./helper');
  let assert = require('assert');
  let jwt = require('jsonwebtoken');

  if (!helper.hasPulseCredentials()) {
    setup(function() {
      this.skip();
    });
  }

  test('webhooktunnelToken', async () => {
    let {tunnelId, token, proxyUrl} = await helper.auth.webhooktunnelToken();
    let decoded = jwt.verify(token, 'test-secret');

    assert(decoded !== null);
    assert(decoded.tid === tunnelId);
    assert(decoded.sub === 'static/taskcluster/root');
  });
});
