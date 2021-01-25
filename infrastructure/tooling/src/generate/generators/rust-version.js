const { readRepoFile, modifyRepoFile } = require('../../utils');

/**
 * Update the Rust version to match everywhere, treating that in `rust-toolchain`
 * as authoritative.
 */
exports.tasks = [{
  title: 'Rust Version',
  provides: ['target-rust-version'],
  run: async (requirements, utils) => {
    const rustVersion = (await readRepoFile('rust-toolchain')).trim();

    utils.step({ title: `Setting Rust version ${rustVersion} in source files` });

    utils.status({ message: 'taskcluster/ci/client/kind.yml' });
    await modifyRepoFile('taskcluster/ci/client/kind.yml',
      contents => contents.replace(
        /docker-image: '?rust:.*'?/,
        `docker-image: rust:${rustVersion}`));
  },
}];
