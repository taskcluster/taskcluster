import util from 'util';
const exec = util.promisify(require('child_process').exec);
import _ from 'lodash';

export const tasks = [];
exports.tasks.push({
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
        const res = await exec(`git grep '${pattern}' -- './*' ':!.yarn'`);
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
});
