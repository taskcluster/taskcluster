const assert = require('assert');
const taskcluster = require('taskcluster-client');
const { NOOP } = require('../utils/constants');
const hash = require('../utils/hash');

module.exports = function ({ session, db, options = {} }) {
  const { Store } = session;

  assert(session, 'An express-session object is required');
  assert(db, 'A database is required');

  const {
    // Session timeout in a format that `fromNow` (taskcluster-client) understands. Defaults to 1 day
    sessionTimeout = '1 day',
  } = options;

  return class PostgresSessionStore extends Store {
    /*
     * required
     *
     * This is used to destroy/delete a session from the store given a session ID (sessionId).
     * The callback should be called as callback(error) once the session is destroyed.
     */
    async destroy(sessionId, callback = NOOP) {
      try {
        const hashedSessionId = hash(sessionId);

        await db.fns.session_remove(hashedSessionId);

        return callback();
      } catch (err) {
        return callback(err);
      }
    }

    /*
     * required
     *
     * This required method is used to get a session from the store given a
     * session ID (sessionId). The callback should be called as callback(error,
     * session).
     *
     * The session argument should be a session if found, otherwise null or
     * undefined if the session was not found (and there was no error). A
     * special case is made when error.code === 'ENOENT' to act like
     * callback(null, null).
     */
    async get(sessionId, callback = NOOP) {
      try {
        const hashedSessionId = hash(sessionId);
        const [row] = await db.fns.session_load(hashedSessionId);

        if (!row) {
          return callback();
        }

        return callback(null, row.data);
      } catch (err) {
        if (err.statusCode === 404) {
          return callback(null, null);
        }

        return callback(err);
      }
    }

    /*
     * Required
     *
     * This is used to upsert a session into the store given an encrypted
     * session ID (sessionId) and session (data) object.  The callback should
     * be called as callback(error) once the session has been set in the store.
     */
    async set(sessionId, data, callback = NOOP) {
      try {
        const encryptedSessionID = db.encrypt({ value: Buffer.from(sessionId, 'utf8') });
        const hashedSessionId = hash(sessionId);

        await db.fns.session_add(
          hashedSessionId,
          encryptedSessionID,
          data,
          taskcluster.fromNow(sessionTimeout),
        );

        return callback();
      } catch (err) {
        return callback(err);
      }
    }

    /*
     * Recommended
     *
     * This recommended method is used to "touch" a given session given a
     * session ID (sessionId) and session (data) object. The callback should be
     * called as callback(error) once the session has been touched.
     *
     * This is primarily used when the store will automatically delete idle
     * sessions and this method is used to signal to the store the given
     * session is active, potentially resetting the idle timer.
     */
    async touch(sessionId, data, callback = NOOP) {
      try {
        const hashedSessionId = hash(sessionId);

        await db.fns.session_touch(hashedSessionId, data, taskcluster.fromNow(sessionTimeout));
        return callback();
      } catch (err) {
        return callback(err);
      }
    }
  };
};
