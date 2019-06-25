const path = require('path');
const util = require('util');
const exec = util.promisify(require('child_process').execFile);
const {REPO_ROOT, readRepoFile, execCommand} = require('../../utils');

exports.tasks = [{
  title: 'Generate Taskcluster-Client-Go',
  requires: ['references-json'],
  provides: ['target-taskcluster-client-go'],
  run: async (requirements, utils) => {
    utils.status({message: 'Checking go version'});

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

    utils.status({message: 'Running `go generate`'});
    await execCommand({
      dir: path.join(REPO_ROOT, 'clients', 'client-go'),
      command: ['go', 'generate', './...'],
      utils,
    });
  },
}];
