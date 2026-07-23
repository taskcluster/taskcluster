import Dexie from 'dexie';

const db = new Dexie('collections');

db.version(1).stores({
  taskIdsHistory: 'taskId',
  taskGroupIdsHistory: 'taskGroupId',
  userPreferences: '',
  taskDefinitions: 'metadata.name, created',
});

db.version(2)
  .stores({
    taskIdsHistory: 'taskId, viewedAt',
    taskGroupIdsHistory: 'taskGroupId, viewedAt',
    userPreferences: '',
    taskDefinitions: 'metadata.name, created',
  })
  .upgrade(trans =>
    // Back-fill viewedAt on records written before v2, which lacked the index.
    // Without this, legacy records are silently absent from the new
    // `.orderBy('viewedAt')` index and never appear in the recent lists again.
    // Sentinel 0 sorts last under the descending recency order, so legacy
    // entries render but age out as the user browses — they are never dropped
    // (review comment discussion_r3579292033).
    trans
      .table('taskIdsHistory')
      .toCollection()
      .modify(rec => {
        if (rec.viewedAt === undefined) {
          rec.viewedAt = 0;
        }
      })
      .then(() =>
        trans
          .table('taskGroupIdsHistory')
          .toCollection()
          .modify(rec => {
            if (rec.viewedAt === undefined) {
              rec.viewedAt = 0;
            }
          })
      )
  );

/**
 * A wrapper around indexDB. If you're not dealing with collections,
 * use localForage or localStorage instead.
 * */
export default db;
