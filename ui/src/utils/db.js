import Dexie from 'dexie';

const db = new Dexie('collections');

db.version(1).stores({
  taskIdsHistory: 'taskId',
  taskGroupIdsHistory: 'taskGroupId',
  userPreferences: '',
  taskDefinitions: 'metadata.name, created',
});

/**
 * A wrapper around indexDB. If you're not dealing with collections,
 * use localForage or localStorage instead.
 * */
export default db;
