const path = require('path');
const util = require('util');
const exec = util.promisify(require('child_process').execFile);
const {REPO_ROOT, readRepoFile, execCommand} = require('../../utils');

exports.tasks = [{
  title: 'Check Go Version',
  requires: [],
  provides: ['go-version'],
  run: async (requirements, utils) => {
    const goVersion = (await readRepoFile('.go-version')).trim();
    const errmsg = `Client generation requires ${goVersion}.  Consider using https://github.com/moovweb/gvm.`;
    let version;
    try {
      version = (await exec('go', ['version'])).stdout.split(/\s+/)[2];
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(`Cannot find \`go\`.  ${errmsg}`);
      }
    }
    if (version !== goVersion) {
      throw new Error(`Found ${version}.  ${errmsg}`);
    }
  },
}, {
  title: 'Generate Taskcluster-Client-Go',
  requires: ['references-json', 'go-version'],
  provides: ['target-taskcluster-client-go'],
  run: async (requirements, utils) => {
    await execCommand({
      dir: path.join(REPO_ROOT, 'clients', 'client-go'),
      command: ['go', 'generate', './...'],
      utils,
    });
  },
}, {
  title: 'Run Go Mod Tidy',
  requires: ['references-json', 'go-version'],
  provides: ['go-mod-tidy'],
  run : async (requirements, utils) => {
    await execCommand({
      dir: path.join(REPO_ROOT, 'clients', 'client-go'),
      command: ['go', 'mod', 'tidy'],
      utils,
    })
  }
}];
