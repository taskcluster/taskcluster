/** Number of objects to delete in parallel */
const BATCH_SIZE = 20;

const expireObject = async ({ object, monitor, db, backends }) => {
  const backend = backends.get(object.backend_id);
  if (!backend) {
    monitor.reportError(
      new Error(`object has unknown backend_id ${object.backend_id}`),
      { name: object.name });
    return;
  }

  let deleted;
  try {
    deleted = await backend.expireObject(object);
  } catch (err) {
    // on error, report it and move on, so that failures to remove one object do not block
    // expiration of other objects.
    monitor.reportError(err, { name: object.name, backendId: backend.backendId });
    return;
  }

  // If the bcakend confirms that this object's resources are freed, then delete the DB row.
  // Otherwise, we'll try again on the next expiration run.
  if (deleted) {
    await db.fns.delete_object(object.name);
  }
};

/**
 * Expire objects which are past their expiration time, in collaboration
 * with their backends.
 */
const expireObjects = async ({ monitor, db, backends }) => {
  let startAt = null;
  while (true) {
    const res = await db.fns.get_expired_objects({ limit_in: BATCH_SIZE, start_at_in: startAt });
    if (res.length === 0) {
      return;
    }
    startAt = res[res.length - 1].name;

    await Promise.all(res.map(object => expireObject({ object, monitor, db, backends })));
  }
};

module.exports = expireObjects;
