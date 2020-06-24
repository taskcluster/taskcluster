const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const assert = require('assert').strict;
const crypto = require('crypto');

suite(testing.suiteName(), function() {
  const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
  helper.withDbForVersion();

  suiteSetup(async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(THIS_VERSION);
  });

  const hash = (t) => {
    return crypto
      .createHash('sha512')
      .update(t, 'utf8')
      .digest('hex');
  };

  test('hashes a key', async function() {
    await helper.withDbClient(async client => {
      const result = await client.query(
        `select sha512('foo/bar')`);
      assert.equal(result.rows[0].sha512, 'bde4b6d1294f077c16c73e2545ef4384de28857d727a0a667182d7aaabcb22794569f2236ac7442f9b681bbee367a63361e5bcccd3412b7c42e059b51353f55c');
      assert.equal(result.rows[0].sha512, hash('foo/bar'));
    });
  });
});
