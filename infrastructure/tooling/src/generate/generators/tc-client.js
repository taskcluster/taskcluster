import stringify from 'json-stable-stringify';
import { writeRepoFile } from '../../utils/index.js';

export const tasks = [{
  title: 'Generate Taskcluster-Client',
  requires: ['apis'],
  provides: ['target-taskcluster-client'],
  run: async (requirements, utils) => {
    const apis = requirements['apis'];

    await writeRepoFile('clients/client/src/apis.js',
      '/* eslint-disable */\nexport default ' + stringify(apis, { space: 2 }) + ';\n');
  },
}];
