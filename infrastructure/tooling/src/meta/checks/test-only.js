const util = require('util');
const exec = util.promisify(require('child_process').exec);
const _ = require('lodash');

exports.tasks = [];
exports.tasks.push({
  title: 'Test scripts do not use `test.only(..)`',
  requires: [],
  provides: [],
  run: async () => {
    try {
      const res = await exec(`git grep 'test.only(' -- './**_test.js' ':!.yarn'`);
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
