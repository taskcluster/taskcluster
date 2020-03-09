const util = require('util');
const exec = util.promisify(require('child_process').execFile);

exports.tasks = [{
  title: 'Go Mod Tidy',
  provides: ['target-go-mod-tidy'],
  run: async (requirements, utils) => {
    await exec('go', ['mod', 'tidy']);
  },
}];
