import { Schema } from '@taskcluster/lib-postgres';
import { getDbReleases, readRepoJSON, updateDbFns } from '../../utils/index.js';

export const tasks = [
  {
    title: 'README DB Functions',
    requires: ['db-schema-serializable'],
    provides: ['db-fns-readme'],
    run: async (requirements, _utils) => {
      const currentTcVersion = (await readRepoJSON('package.json')).version;
      const schema = Schema.fromSerializable(requirements['db-schema-serializable']);
      const releases = await getDbReleases();
      await updateDbFns(schema, releases, currentTcVersion);
    },
  },
];
