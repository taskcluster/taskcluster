import Dexie from 'dexie';

const db = new Dexie('collections');

db.version(1).stores({
  taskIdsHistory: 'taskId',
  taskGroupIdsHistory: 'taskGroupId',
  userPreferences: '',
  taskDefinitions: 'metadata.name, created',
});

db.version(2).stores({
  taskIdsHistory: 'taskId, viewedAt',
  taskGroupIdsHistory: 'taskGroupId, viewedAt',
  userPreferences: '',
  taskDefinitions: 'metadata.name, created',
});

/**
 * A wrapper around indexDB. If you're not dealing with collections,
 * use localForage or localStorage instead.
 * */
export default db;
