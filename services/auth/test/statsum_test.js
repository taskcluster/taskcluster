suite('statsum', () => {
  let helper = require('./helper');
  let assert = require('assert');

  if (!helper.hasPulseCredentials()) {
    setup(function() {
      this.skip();
    });
  }

  test('statsumToken', async () => {
    let result = await helper.auth.statsumToken('test');

    assert(result.project === 'test');
    assert(result.token);
    assert(result.baseUrl);
    assert(result.expires);
  });
});
