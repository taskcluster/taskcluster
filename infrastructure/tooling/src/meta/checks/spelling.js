import util from 'util';
import { exec } from 'child_process';
const execPromise = util.promisify(exec);
import _ from 'lodash';

export const tasks = [{
  title: 'Proper spelling and capitalization of Taskcluster',
  requires: [],
  provides: [],
  run: async () => {
    const Taskcluster = [
      "Task[C]luster",
      "Task [c]luster",
      "Task [C]luster",
      "[tT]skclsuter",
      "[tT]askclsuter",
      "[tT]asksluter",
    ];
    for (let pattern of Taskcluster) {
      try {
        const res = await execPromise(`git grep '${pattern}' -- './*' ':!.yarn'`);
        // if the grep succeeded, then something matched
        throw new Error(`misspellings found: ${res.stdout}`);
      } catch (err) {
        if (err.code === 1) {
          // git grep found nothing
          continue;
        }
        throw err;
      }
    }
  },
}];
