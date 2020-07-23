const slug = require('slugid');
const { fromNow } = require('taskcluster-client');
const crypto = require('crypto');
const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'web_server' });

  setup('truncate tables', async function() {
    await helper.withDbClient(async client => {
      await client.query('truncate github_access_tokens');
      await client.query('truncate sessions');
      await client.query('truncate authorization_codes');
      await client.query('truncate access_tokens');
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

    helper.dbTest('touch a session', async function(db) {
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

      await db.fns.session_touch(sessionData1.hashedSessionId, { bar: 'baz' }, new Date(2));
      sessionAsTable = await db.fns.session_load(sessionData1.hashedSessionId);
      assert.equal(sessionAsTable.length, 1);
      assert(typeof sessionAsTable[0].encrypted_session_id === 'object');
      assert.deepEqual(sessionAsTable[0]["data"], { bar: 'baz' });
      assert.deepEqual(sessionAsTable[0]["expires"], new Date(2));
    });

    helper.dbTest('touch throws a P0002 when no such row', async function(db) {
      const sessionId = 'sEssI0n#Id';
      await assert.rejects(
        async () => {
          await db.fns.session_touch(hash(sessionId), { foo: 'bar' }, new Date(1));
        },
        /P0002/
      );
    });

    helper.dbTest('remove session data does not throw when not found', async function(db) {
      await db.fns.session_remove(hash('not-found'));
    });

    helper.dbTest('expire_sessions', async function(db) {
      const sessionIds = [
        'sEssI0n#Id',
        'sEssI1n#Id',
        'sEssI2n#Id',
      ];
      const samples = [
        {
          hashedSessionId: hash(sessionIds[0]),
          encryptedSessionID: db.encrypt({ value: Buffer.from(sessionIds[0], 'utf8') }),
          data: { foo: 'bar' },
          expires: fromNow('1 day'),
        },
        {
          hashedSessionId: hash(sessionIds[1]),
          encryptedSessionID: db.encrypt({ value: Buffer.from(sessionIds[1], 'utf8') }),
          data: { foo: 'bar' },
          expires: fromNow('-1 day'),
        },
      ];

      for (let i = 0; i < samples.length; i++) {
        await db.fns.session_add(
          samples[i].hashedSessionId,
          samples[i].encryptedSessionID,
          samples[i].data,
          samples[i].expires,
        );
      }

      const count = (await db.fns.expire_sessions())[0].expire_sessions;

      assert.equal(count, 1);

      const [entry] = await db.fns.session_load(hash(sessionIds[0]));
      assert(entry);
    });
  });

  suite(`${testing.suiteName()} - authorization_codes`, function() {
    const code = slug.v4();
    const now = new Date();
    const clientDetails = {
      clientId: 'client-id',
      description: '',
      scopes: [],
      expires: now.toJSON(),
      deleteOnExpiration: true,
    };
    const mkAuthorizationCode = (db, overrides = {}) => {
      return db.fns.create_authorization_code(
        overrides.code || code,
        overrides.client_id || 'client-id',
        overrides.redirect_uri || 'www.example.com',
        overrides.identity || 'identity',
        overrides.identity_provider_id || 'identity-provider-id',
        overrides.expires || now,
        overrides.client_details || clientDetails,
      );
    };

    helper.dbTest('get_authorization_code returns an entry', async function(db) {
      await mkAuthorizationCode(db);
      const [authorizationCode] = await db.fns.get_authorization_code(code);
      assert.equal(authorizationCode.code, code);
      assert.equal(authorizationCode.client_id, 'client-id');
      assert.equal(authorizationCode.redirect_uri, 'www.example.com');
      assert.equal(authorizationCode.identity, 'identity');
      assert.equal(authorizationCode.identity_provider_id, 'identity-provider-id');
      assert.equal(authorizationCode.expires.toJSON(), now.toJSON());
      assert.deepEqual(authorizationCode.client_details, clientDetails);
    });

    helper.dbTest('get_authorization_code does not throw when not found', async function(db) {
      await db.fns.get_authorization_code('not-found');
    });

    helper.dbTest('create_authorization_code returns the authorization code', async function(db) {
      const [authorizationCode] = await mkAuthorizationCode(db);
      assert.equal(authorizationCode.code, code);
      assert.equal(authorizationCode.client_id, 'client-id');
      assert.equal(authorizationCode.redirect_uri, 'www.example.com');
      assert.equal(authorizationCode.identity, 'identity');
      assert.equal(authorizationCode.identity_provider_id, 'identity-provider-id');
      assert.equal(authorizationCode.expires.toJSON(), now.toJSON());
      assert.deepEqual(authorizationCode.client_details, clientDetails);
    });

    helper.dbTest('create_authorization_code throws when row exists', async function(db) {
      await mkAuthorizationCode(db);
      await assert.rejects(
        async () => {
          await mkAuthorizationCode(db);
        },
        err => err.code === UNIQUE_VIOLATION,
      );
    });

    helper.dbTest('expire_authorization_codes returns the count', async function(db) {
      const slugs = [
        slug.v4(),
        slug.v4(),
        slug.v4(),
      ];
      await mkAuthorizationCode(db, { code: slugs[0], expires: fromNow('-1 day') });
      await mkAuthorizationCode(db, { code: slugs[1], expires: fromNow('- 1 day') });
      await mkAuthorizationCode(db, { code: slugs[2], expires: fromNow('1 day') });
      const count = (await db.fns.expire_authorization_codes(new Date()))[0].expire_authorization_codes;
      assert.equal(count, 2);
    });
  });

  suite(`${testing.suiteName()} - access_tokens`, function() {
    const accessToken = 'womp';
    const now = new Date();
    const clientDetails = {
      clientId: 'client-id',
      description: '',
      scopes: [],
      expires: now.toJSON(),
      deleteOnExpiration: true,
    };
    const mkAcessToken = (db, overrides = {}) => {
      return db.fns.create_access_token(
        overrides.hashed_access_token || hash(accessToken),
        overrides.encrypted_access_token || db.encrypt({ value: Buffer.from(accessToken, 'utf8') }),
        overrides.client_id || 'client-id',
        overrides.redirect_uri || 'www.example.com',
        overrides.identity || 'identity',
        overrides.identity_provider_id || 'identity-provider-id',
        overrides.expires || now,
        overrides.client_details || clientDetails,
      );
    };

    helper.dbTest('get_access_token returns an entry', async function(db) {
      await mkAcessToken(db);
      const [at] = await db.fns.get_access_token(hash(accessToken));
      assert.equal(at.hashed_access_token, hash(accessToken));
      assert.equal(db.decrypt({ value: at.encrypted_access_token }).toString('utf8'), accessToken);
      assert.equal(at.client_id, 'client-id');
      assert.equal(at.redirect_uri, 'www.example.com');
      assert.equal(at.identity, 'identity');
      assert.equal(at.identity_provider_id, 'identity-provider-id');
      assert.equal(at.expires.toJSON(), now.toJSON());
      assert.deepEqual(at.client_details, clientDetails);
    });

    helper.dbTest('get_access_token does not throw when not found', async function(db) {
      await db.fns.get_access_token('not-found');
    });

    helper.dbTest('create_access_token returns the authorization code', async function(db) {
      const [at] = await mkAcessToken(db);
      assert.equal(at.hashed_access_token, hash(accessToken));
      assert.equal(db.decrypt({ value: at.encrypted_access_token }).toString('utf8'), accessToken);
      assert.equal(at.client_id, 'client-id');
      assert.equal(at.redirect_uri, 'www.example.com');
      assert.equal(at.identity, 'identity');
      assert.equal(at.identity_provider_id, 'identity-provider-id');
      assert.equal(at.expires.toJSON(), now.toJSON());
      assert.deepEqual(at.client_details, clientDetails);
    });

    helper.dbTest('create_access_token throws when row exists', async function(db) {
      await mkAcessToken(db);
      await assert.rejects(
        async () => {
          await mkAcessToken(db);
        },
        err => err.code === UNIQUE_VIOLATION,
      );
    });

    helper.dbTest('expire_authorization_codes returns the count', async function(db) {
      const slugs = [
        slug.v4(),
        slug.v4(),
        slug.v4(),
      ];
      await mkAcessToken(db, { hashed_access_token: hash(slugs[0]), encrypted_hash_token: db.encrypt({ value: Buffer.from(slugs[0], 'utf8') }), expires: fromNow('-1 day') });
      await mkAcessToken(db, { hashed_access_token: hash(slugs[1]), encrypted_hash_token: db.encrypt({ value: Buffer.from(slugs[1], 'utf8') }), expires: fromNow('-1 day') });
      await mkAcessToken(db, { hashed_access_token: hash(slugs[2]), encrypted_hash_token: db.encrypt({ value: Buffer.from(slugs[2], 'utf8') }), expires: fromNow('1 day') });
      const count = (await db.fns.expire_access_tokens(new Date()))[0].expire_access_tokens;
      assert.equal(count, 2);
    });
  });
});
