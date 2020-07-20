const crypto = require('crypto');
const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'web_server' });

  setup('truncate tables', async function() {
    await helper.withDbClient(async client => {
      await client.query('truncate github_access_tokens');
      await client.query('truncate sessions');
    });
  });

  suite(`${testing.suiteName()} - github_access_tokens`, function() {
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

  const hash = (t) => {
    return crypto
      .createHash('sha512')
      .update(t, 'utf8')
      .digest('hex');
  };

  suite(`${testing.suiteName()} - sessions`, function() {
    helper.dbTest('add session data', async function(db) {
      const sessionId = 'sEssI0n#Id';
      let sessionData1 = {
        hashedSessionId: hash(sessionId),
        encryptedSessionID: db.encrypt({ value: Buffer.from(sessionId, 'utf8') }),
        data: {
          foo: "bar",
        },
        expires: new Date(),
      };
      await db.fns.session_add(
        sessionData1.hashedSessionId,
        sessionData1.encryptedSessionID,
        sessionData1.data,
        sessionData1.expires,
      );
      const sessionAsTable = await db.fns.session_load(sessionData1.hashedSessionId);
      assert.equal(sessionAsTable.length, 1);
      assert(typeof sessionAsTable[0].encrypted_session_id === 'object');
      assert.deepEqual(sessionAsTable[0]["data"], sessionData1.data);
      assert.deepEqual(sessionAsTable[0]["expires"], sessionData1.expires);
    });

    helper.dbTest('add session data can overwrite', async function(db) {
      const sessionId = 'sEssI0n#Id';
      let sessionData1 = {
        hashedSessionId: hash(sessionId),
        encryptedSessionID: db.encrypt({ value: Buffer.from(sessionId, 'utf8') }),
        data: {
          foo: "bar",
        },
        expires: new Date(),
      };
      let sessionData2 = {
        ...sessionData1,
        data: {
          foo: "bar",
        },
      };
      await db.fns.session_add(
        sessionData1.hashedSessionId,
        sessionData1.encryptedSessionID,
        sessionData1.data,
        sessionData1.expires,
      );
      await db.fns.session_add(
        sessionData2.hashedSessionId,
        sessionData2.encryptedSessionID,
        sessionData2.data,
        sessionData2.expires,
      );
      const sessionAsTable = await db.fns.session_load(sessionData1.hashedSessionId);
      assert.equal(sessionAsTable.length, 1);
      assert(typeof sessionAsTable[0].encrypted_session_id === 'object');
      assert.deepEqual(sessionAsTable[0]["data"], sessionData2.data);
      assert.deepEqual(sessionAsTable[0]["expires"], sessionData2.expires);
    });

    helper.dbTest('get session data does not throw when not found', async function(db) {
      const sessionId = 'sEssI0n#Id';
      let sessionData1 = {
        hashedSessionId: hash(sessionId),
        encryptedSessionID: db.encrypt({ value: Buffer.from(sessionId, 'utf8') }),
        data: {
          foo: "bar",
        },
        expires: new Date(),
      };
      const sessionAsTable = await db.fns.session_load(sessionData1.hashedSessionId);
      assert.equal(sessionAsTable.length, 0);
    });

    helper.dbTest('remove session data', async function(db) {
      const sessionId = 'sEssI0n#Id';
      let sessionData1 = {
        hashedSessionId: hash(sessionId),
        encryptedSessionID: db.encrypt({ value: Buffer.from(sessionId, 'utf8') }),
        data: {
          foo: "bar",
        },
        expires: new Date(),
      };
      await db.fns.session_add(
        sessionData1.hashedSessionId,
        sessionData1.encryptedSessionID,
        sessionData1.data,
        sessionData1.expires,
      );
      let sessionAsTable = await db.fns.session_load(sessionData1.hashedSessionId);
      assert.equal(sessionAsTable.length, 1);
      assert(typeof sessionAsTable[0].encrypted_session_id === 'object');
      assert.deepEqual(sessionAsTable[0]["data"], sessionData1.data);
      assert.deepEqual(sessionAsTable[0]["expires"], sessionData1.expires);

      await db.fns.session_remove(sessionData1.hashedSessionId);
      sessionAsTable = await db.fns.session_load(sessionData1.hashedSessionId);
      assert.equal(sessionAsTable.length, 0);
    });

    helper.dbTest('remove session data does not throw when not found', async function(db) {
      await db.fns.session_remove(hash('not-found'));
    });
  });
});
