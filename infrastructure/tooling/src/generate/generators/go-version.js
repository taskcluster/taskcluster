const util = require('util');
const exec = util.promisify(require('child_process').execFile);
const { readRepoFile, modifyRepoFile } = require('../../utils');

/**
 * Update the Go version to match everywhere, treating that in `package.json`
 * as authoritative.
 */
exports.tasks = [{
  title: 'Go Version',
  provides: ['target-go-version'],
  run: async (requirements, utils) => {
    const goVersion = (await readRepoFile('.go-version')).trim();
    utils.step({ title: 'Checking go version' });

    const errmsg = `'yarn generate' requires ${goVersion}.  Consider using https://github.com/moovweb/gvm.`;
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

    utils.step({ title: `Setting go version ${goVersion} in source files` });

    utils.status({ message: '.taskcluster.yml' });
    await modifyRepoFile('.taskcluster.yml',
      contents => contents.replace(
        /^( *go: ')[0-9.]+(')$/m,
        `$1${goVersion.slice(2)}$2`));

    utils.status({ message: 'dev-docs/development-process.md' });
    modifyRepoFile('dev-docs/development-process.md',
      contents => contents.replace(
        /Go version go[0-9.]+/,
        `Go version ${goVersion}`));
  },
}];
