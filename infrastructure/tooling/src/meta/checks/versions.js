import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../../utils/index.js';

export const tasks = [
  {
    title: 'Node versions match',
    requires: [],
    provides: [],
    run: async () => {
      const packageJsonFile = path.join(REPO_ROOT, 'package.json');
      const uiPackageJsonFile = path.join(REPO_ROOT, 'ui/package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, 'utf8'));
      const uiPackageJson = JSON.parse(fs.readFileSync(uiPackageJsonFile, 'utf8'));

      // Node version for UI matches the rest of the repo
      assert.equal(packageJson.engines.node, uiPackageJson.engines.node);
    },
  },
];
