import fs from 'fs';
import glob from 'glob';
import _ from 'lodash';
import { REPO_ROOT } from '../../utils';

export const tasks = [];
exports.tasks.push({
  title: 'Workspace package.json files do not have forbidden fields',
  requires: [],
  provides: [],
  run: async (requirements, utils) => {
    const packageJsons = glob.sync(
      '{services,libraries}/*/package.json',
      { cwd: REPO_ROOT });

    const forbidden = [
      'engines',
      'engineStrict',
      'engine-strict',
      'dependencies',
      'devDependencies',
      'files',
    ];
    for (let filename of packageJsons) {
      const pj = JSON.parse(fs.readFileSync(filename));
      for (let prop of forbidden) {
        if (pj[prop]) {
          throw new Error(`${filename} contains forbidden property ${prop}`);
        }
      }
    }
  },
});
