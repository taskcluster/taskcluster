import assert from 'assert';
import path from 'path';
import fs from 'fs';
import _ from 'lodash';
import { REPO_ROOT } from '../../utils/index.js';

export const tasks = [{
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
}];
