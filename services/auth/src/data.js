const _ = require('lodash');
const uuid = require('uuid');

/**
 * Update roles, given a modifier function.  The modification is
 * serialized with any other modifications using optimistic concurrency.  The
 * modifier may be called multiple times.
 */
exports.modifyRoles = async (db, modifier) => {
  let tries = 5;

  while (tries--) {
    try {
      const roles = await db.fns.get_roles();
      const etag = roles.length > 0 ? roles[0].etag : uuid.v4();
      roles.forEach(r => { delete r.etag; });
      await modifier({ roles });
      await db.fns.modify_roles(JSON.stringify(roles), etag);
    } catch (e) {
      // P0004 means there was a conflict, so try again
      if (e.code !== 'P0004') {
        throw e;
      }
    }
    return; // success!
  }

  throw new Error('Could not modify roles; too many conflicts');
};
