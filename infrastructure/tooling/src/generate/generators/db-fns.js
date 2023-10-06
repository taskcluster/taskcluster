import { Schema } from 'taskcluster-lib-postgres';
import { getDbReleases, updateDbFns, readRepoJSON } from '../../utils';

export const tasks = [{
  title: 'README DB Functions',
  requires: ['db-schema-serializable'],
  provides: ['db-fns-readme'],
  run: async (requirements, utils) => {
    const currentTcVersion = (await readRepoJSON('package.json')).version;
    const schema = Schema.fromSerializable(requirements['db-schema-serializable']);
    const releases = await getDbReleases();
    await updateDbFns(schema, releases, currentTcVersion);
  },
}];
