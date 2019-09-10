const {readRepoFile, modifyRepoFile} = require('../../utils');

/**
 * Update the Go version to match everywhere, treating that in `package.json`
 * as authoritative.
 */
exports.tasks = [{
  title: 'Go Version',
  provides: ['target-go-version'],
  run: async (requirements, utils) => {
    const goVersion = (await readRepoFile('.go-version')).trim();
    utils.step({title: `Setting go version ${goVersion}`});

    utils.status({message: '.taskcluster.yml'});
    await modifyRepoFile('.taskcluster.yml',
      contents => contents.replace(
        /^( *go: ')[0-9.]+(')$/m,
        `$1${goVersion.slice(2)}$2`));

    utils.status({message: 'dev-docs/development-process.mdx'});
    modifyRepoFile('dev-docs/development-process.mdx',
      contents => contents.replace(
        /Go version go[0-9.]+/,
        `Go version ${goVersion}`));
  },
}];
