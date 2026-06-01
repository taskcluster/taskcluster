import util from 'node:util';
import { execFile } from 'node:child_process';
const execFileAsync = util.promisify(execFile);

export const tasks = [];
tasks.push({
  title: 'Test scripts do not use `test.only(..)`',
  requires: [],
  provides: [],
  run: async () => {
    try {
      const res = await execFileAsync('git', ['grep', 'test.only(', '--', './**_test.js', ':!.yarn']);
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
