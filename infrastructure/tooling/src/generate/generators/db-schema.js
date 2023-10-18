import tcdb from 'taskcluster-db';
import { writeRepoJSON } from '../../utils/index.js';

// Generate a readable JSON version of the schema.
export const tasks = [{
  title: 'DB Schema',
  requires: [],
  provides: ['db-schema-serializable'],
  run: async (requirements, utils) => {
    const schema = tcdb.schema({ useDbDirectory: true });

    const serializable = schema.asSerializable();
    writeRepoJSON('generated/db-schema.json', serializable);

    return {
      'db-schema-serializable': serializable,
    };
  },
}];
