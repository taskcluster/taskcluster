const path = require('path');
const {REPO_ROOT, modifyRepoFile, execCommand} = require('../../utils');

exports.tasks = [];

exports.tasks.push({
  title: 'Update worker-runner README file',
  requires: ['references-json', 'target-go-version'],
  provides: ['target-worker-runner'],
  run: async (requirements, utils) => {
    const getDoc = async doc => {
      return await execCommand({
        dir: path.join(REPO_ROOT, 'tools', 'worker-runner'),
        command: ['go', 'run', path.join(REPO_ROOT, 'tools', 'worker-runner', 'cmd', 'generate-docs'), doc],
        utils,
        keepAllOutput: true,
      });
    };

    await modifyRepoFile(
      path.join('ui', 'docs', 'reference', 'workers', 'worker-runner', 'README.mdx'),
      async content => content
        .replace(
          /(<!-- RUNNER-CONFIG BEGIN -->)(?:.|\n)*(<!-- RUNNER-CONFIG END -->)/m,
          `$1\n${await getDoc('runner-config')}\n$2`)
        .replace(
          /(<!-- PROVIDERS BEGIN -->)(?:.|\n)*(<!-- PROVIDERS END -->)/m,
          `$1\n${await getDoc('providers')}\n$2`)
        .replace(
          /(<!-- WORKERS BEGIN -->)(?:.|\n)*(<!-- WORKERS END -->)/m,
          `$1\n${await getDoc('workers')}\n$2`)
        .replace(
          /(<!-- LOGGING BEGIN -->)(?:.|\n)*(<!-- LOGGING END -->)/m,
          `$1\n${await getDoc('logging')}\n$2`));
  },
});
