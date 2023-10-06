import path from 'path';
import fs from 'fs';
import _ from 'lodash';
import glob from 'glob';
import { REPO_ROOT } from '../../utils/index.js';

export const tasks = [];
tasks.push({
  title: 'Every DB version has a test script',
  requires: [],
  provides: [],
  run: async () => {
    const versionFiles = glob.sync('db/versions/*.yml', { cwd: REPO_ROOT }).map(path => path.split('/')[2]);
    for (let file of versionFiles) {
      const testFile = `db/test/versions/${path.basename(file, '.yml')}_test.js`;
      if (!fs.existsSync(testFile)) {
        throw new Error(`Expected ${testFile} to exist to test db/versions/${file}`);
      }
    }
  },
});
