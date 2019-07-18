const helper = require('./helper');
const assert = require('assert');
const slugid = require('slugid');
const { suiteName } = require('taskcluster-lib-testing');
const regenerateSession = require('../src/utils/regenerateSession');

helper.sessions.mockSuite(suiteName(), ['taskcluster'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);

  const makeUser = () => {
    const id = slugid.v4();

    return {
      identityProviderId: 'mozilla-auth0',
      identity: `mozilla-auth0/ad|Mozilla-LDAP|${id}`,
    };
  };

  const makeSession = async (opts) => {
    const session = Object.assign({
      sessionId: slugid.v4(),
      expires: new Date('3017-07-29'),
    }, opts);

    await helper.Session.create(session);

    return session;
  };

  test('session exists in Session table', async () => {
    const user = makeUser();
    const session = await makeSession({ sessionValue: user });
    const result = await helper.Session.load({ sessionId: session.sessionId });

    assert.equal(result.sessionId, session.sessionId, `expected ${session.sessionId}`);
    assert.deepEqual(result.sessionValue, session.sessionValue, `expected same session value`);
  });

  test('session expiration works', async () => {
    const user = makeUser();

    await makeSession({ sessionValue: user, expires: new Date('2000-01-01') });
    await helper.runExpiration('expire-sessions');

    const result = await helper.Session.scan();

    assert.equal(result.entries.length, 0, 'expected no sessions');
  });

  test('session can be replaced', async () => {
    const user = makeUser();
    const originalSession = await makeSession({ sessionValue: user, expires: new Date('2000-01-01') });
    const session = await helper.Session.load({ sessionId: originalSession.sessionId });

    await helper.Session.remove({ sessionId: session.sessionId });
    const updatedSession = await makeSession({ sessionValue: user, expires: new Date('2000-01-01') });
    const result = await helper.Session.scan();

    assert.equal(result.entries.length, 1, 'expected a session');
    assert.deepEqual(session.sessionValue, updatedSession.sessionValue, 'expected session value to be the same');
    assert.notEqual(session.sessionId, updatedSession.sessionId, `expected session value to be ${updatedSession.sessionId}`);
  });
});
