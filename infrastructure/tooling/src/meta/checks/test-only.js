import util from 'util';
import { exec } from 'child_process';
const execPromise = util.promisify(exec);
import _ from 'lodash';

export const tasks = [];
tasks.push({
  title: 'Test scripts do not use `test.only(..)`',
  requires: [],
  provides: [],
  run: async () => {
    try {
      const res = await execPromise(`git grep 'test.only(' -- './**_test.js' ':!.yarn'`);
      // if the grep succeeded, then something matched
      throw new Error(`JS test with 'test.only(..)' found: ${res.stdout}`);
    } catch (err) {
      if (err.code === 1) {
        // git grep found nothing
        return;
      }
      throw err;
    }
  },
});
