import { Schema } from '@taskcluster/lib-postgres';
import { generateDbTypes, getDbReleases, readRepoJSON } from '../../utils/index.js';

export const tasks = [
  {
    title: 'Database types',
    requires: ['db-schema-serializable'],
    provides: ['db-types'],
    run: async (requirements, _utils) => {
      const currentTcVersion = (await readRepoJSON('package.json')).version;
      const schema = Schema.fromSerializable(requirements['db-schema-serializable']);
      const releases = await getDbReleases();
      await generateDbTypes(schema, releases, currentTcVersion);
    },
  },
];
