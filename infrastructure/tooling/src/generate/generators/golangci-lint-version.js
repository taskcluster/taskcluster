const { readRepoFile, modifyRepoFile } = require('../../utils');

/**
 * Update the golangci-lint version to match everywhere, treating that in `.golangci-lint-version`
 * as authoritative.
 */
exports.tasks = [{
  title: 'golangci-lint Version',
  provides: ['target-golangci-lint-version'],
  run: async (requirements, utils) => {
    const golangCILintVersion = (await readRepoFile('.golangci-lint-version')).trim();

    utils.step({ title: `Setting golangci-lint version ${golangCILintVersion} in source files` });

    utils.status({ message: 'workers/generic-worker/gw-decision-task/tasks.yml' });
    await modifyRepoFile('workers/generic-worker/gw-decision-task/tasks.yml',
      contents => contents.replace(
        /golangci-lint-[0-9.]+/g,
        `golangci-lint-${golangCILintVersion}`,
      ).replace(
        /download\/v[0-9.]+\/golangci-lint-/g,
        `download/v${golangCILintVersion}/golangci-lint-`,
      ));
  },
}];
