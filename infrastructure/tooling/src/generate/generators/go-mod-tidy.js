import util from 'util';
const exec = util.promisify(require('child_process').execFile);

export const tasks = [{
  title: 'Go Mod Tidy',
  provides: ['target-go-mod-tidy'],
  run: async (requirements, utils) => {
    await exec('go', ['mod', 'tidy']);
  },
}];
