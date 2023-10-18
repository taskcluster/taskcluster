import util from 'util';
import { exec } from 'child_process';
import _ from 'lodash';
const execPromise = util.promisify(exec);

export const tasks = [{
  title: 'Services are not using node-pg',
  requires: [],
  provides: [],
  run: async () => {
    // This checks one of the tc-lib-postgres security invariants, that
    // services are not using postgres directly
    for (let pattern of ['require\(.pg\)', '_withClient']) {
      try {
        const res = await execPromise(`git grep '${pattern}' -- 'services/'`);
        // if the grep succeeded, then something matched
        throw new Error(`Direct uses of DB found in services/: ${res.stdout}`);
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
