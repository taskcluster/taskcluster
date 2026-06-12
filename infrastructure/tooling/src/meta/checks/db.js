import path from 'node:path';
import fs from 'node:fs';
import glob from 'glob';
import { REPO_ROOT } from '../../utils/index.js';

export const tasks = [{
  title: 'Every DB version has a test script',
  requires: [],
  provides: [],
  run: async () => {
    const versionFiles = glob.sync('db/versions/*.yml', { cwd: REPO_ROOT }).map(path => path.split('/')[2]);
    for (const file of versionFiles) {
      const testFile = `db/test/versions/${path.basename(file, '.yml')}_test.js`;
      if (!fs.existsSync(testFile)) {
        throw new Error(`Expected ${testFile} to exist to test db/versions/${file}`);
      }
    }
  },
}];
