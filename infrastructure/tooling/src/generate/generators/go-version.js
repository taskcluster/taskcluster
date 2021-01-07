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
    const goVersionMajor = goVersion.replace(/^go([0-9]+)\.[0-9]+\.[0-9]+$/, '$1');
    const goVersionMinor = goVersion.replace(/^go[0-9]+\.([0-9]+)\.[0-9]+$/, '$1');
    const goVersionBugfix = goVersion.replace(/^go[0-9]+\.[0-9]+\.([0-9]+)$/, '$1');
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

    utils.status({ message: 'dev-docs/development-process.md' });
    await modifyRepoFile('dev-docs/development-process.md',
      contents => contents.replace(
        /Go version go[0-9.]+/,
        `Go version ${goVersion}`));

    utils.status({ message: 'go.mod' });
    await modifyRepoFile('go.mod',
      contents => contents.replace(
        /^go [0-9.]+$/m,
        `go ${goVersionMajor}.${goVersionMinor}`));

    utils.status({ message: 'workers/generic-worker/build.sh' });
    await modifyRepoFile('workers/generic-worker/build.sh',
      contents => contents.replace(
        /go [0-9.]+ or higher/g,
        `go ${goVersionMajor}.${goVersionMinor} or higher`,
      ).replace(
        /GO_MAJOR_VERSION=[0-9]+/,
        `GO_MAJOR_VERSION=${goVersionMajor}`,
      ).replace(
        /MIN_GO_MINOR_VERSION=[0-9]+/,
        `MIN_GO_MINOR_VERSION=${goVersionMinor}`));

    utils.status({ message: 'workers/generic-worker/clean-builds.sh' });
    await modifyRepoFile('workers/generic-worker/clean-builds.sh',
      contents => contents.replace(
        /go[0-9]+\.[0-9]+\.[0-9]+/g,
        `${goVersion}`));

    utils.status({ message: 'workers/generic-worker/gw-decision-task/tasks.yml' });
    await modifyRepoFile('workers/generic-worker/gw-decision-task/tasks.yml',
      contents => contents.replace(
        /go [0-9]+\.[0-9]+\.[0-9]+/g,
        `go ${goVersionMajor}.${goVersionMinor}.${goVersionBugfix}`,
      ).replace(
        /gopath[0-9]+\.[0-9]+\.[0-9]+/g,
        `gopath${goVersionMajor}.${goVersionMinor}.${goVersionBugfix}`,
      ).replace(
        /go[0-9]+\.[0-9]+\.[0-9]+/g,
        `${goVersion}`));
  },
}];
