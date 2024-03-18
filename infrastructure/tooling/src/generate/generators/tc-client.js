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

    // update client tests to include all exposed apis
    const clientsTest = `// This file is auto-generated, don't edit
import taskcluster from 'taskcluster-client';
import assert from 'assert';

test('Main clients exposed', function () {
${Object.keys(apis)
    .sort()
    .map(api => `  assert.equal(taskcluster.${api} instanceof Function, true);`).join('\n')}
});
`;
    await writeRepoFile('clients/client-test/test/clients_test.js', clientsTest);
  },
}];
