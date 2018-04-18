suite('statsum', () => {
  let helper = require('./helper');
  let assert = require('assert');

  test('statsumToken', async () => {
    let result = await helper.auth.statsumToken('test');

    assert(result.project === 'test');
    assert(result.token);
    assert(result.baseUrl);
    assert(result.expires);
  });
});
