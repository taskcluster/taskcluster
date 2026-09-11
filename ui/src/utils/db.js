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
    // Back-fill viewedAt, or pre-v2 records stay absent from the new index.
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
