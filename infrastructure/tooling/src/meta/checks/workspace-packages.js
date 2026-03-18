import fs from 'node:fs';
import glob from 'glob';
import { REPO_ROOT } from '../../utils/index.js';

export const tasks = [
  {
    title: 'Workspace package.json files do not have forbidden fields',
    requires: [],
    provides: [],
    run: async (_requirements, _utils) => {
      const packageJsons = glob.sync('{services,libraries}/*/package.json', { cwd: REPO_ROOT });

      const forbidden = ['engines', 'engineStrict', 'engine-strict', 'dependencies', 'files'];
      for (const filename of packageJsons) {
        const pj = JSON.parse(fs.readFileSync(filename));
        for (const prop of forbidden) {
          if (pj[prop]) {
            throw new Error(`${filename} contains forbidden property ${prop}`);
          }
        }
      }
    },
  },
];
