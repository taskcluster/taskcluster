const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'web_server' });

  setup('truncate github_access_tokens', async function() {
    await helper.withDbClient(async client => {
      await client.query('truncate github_access_tokens');
    });
  });

  helper.dbTest('add github access token that already exists', async function(db) {
    let n1 = {
      userId: "benjaminrabbit",
      encryptedAccessToken: db.encrypt({ value: Buffer.from("carrots", 'utf8') }),
    };
    await db.fns.add_github_access_token(n1.userId, n1.encryptedAccessToken);
    await db.fns.add_github_access_token(n1.userId, n1.encryptedAccessToken);
    const encryptedAccessTokenAsTable = await db.fns.load_github_access_token(n1.userId);
    assert.equal(encryptedAccessTokenAsTable.length, 1);
    assert.deepEqual(encryptedAccessTokenAsTable[0]["encrypted_access_token"], n1.encryptedAccessToken);
  });

  helper.dbTest('update existing github access token', async function(db) {
    for (let accessToken of ["carrots", "sprouts"]) {
      let n1 = {
        userId: "benjaminrabbit",
        encryptedAccessToken: db.encrypt({ value: Buffer.from(accessToken, 'utf8') }),
      };
      await db.fns.add_github_access_token(n1.userId, n1.encryptedAccessToken);
      const encryptedAccessTokenAsTable = await db.fns.load_github_access_token(n1.userId);
      assert.equal(encryptedAccessTokenAsTable.length, 1);
      assert.deepEqual(encryptedAccessTokenAsTable[0]["encrypted_access_token"], n1.encryptedAccessToken);
    }
  });

  helper.dbTest('load non-existent github access token', async function(db) {
    const encryptedAccessTokenAsTable = await db.fns.load_github_access_token("pretend-user");
    assert.equal(encryptedAccessTokenAsTable.length, 0);
  });
});
