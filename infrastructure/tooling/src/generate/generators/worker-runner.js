import util from 'util';
import path from 'path';
import * as _rimraf from 'rimraf';
const rimraf = util.promisify(_rimraf.default);
import { REPO_ROOT, modifyRepoFile, execCommand } from '../../utils/index.js';

export const tasks = [];

const tempDir = path.join(REPO_ROOT, 'temp');

tasks.push({
  title: 'Update worker-runner README file',
  requires: ['references-json', 'target-go-version'],
  provides: ['target-worker-runner'],
  run: async (requirements, utils) => {
    const binary = path.join(tempDir, 'w-r-generate-docs');
    // we have to build this binary, rather than just using `go run`, because otherwise `go run` spews
    // its own output into stdout
    await execCommand({
      command: ['go', 'build', '-o', binary, './tools/worker-runner/cmd/generate-docs'],
      utils,
    });

    const getDoc = async doc => {
      return await execCommand({
        dir: path.join(REPO_ROOT, 'tools', 'worker-runner'),
        command: [binary, doc],
        utils,
        keepAllOutput: true,
      });
    };

    await modifyRepoFile(
      path.join('ui', 'docs', 'reference', 'workers', 'worker-runner', 'runner-configuration.mdx'),
      async content => content
        .replace(
          /(<!-- RUNNER-CONFIG BEGIN -->)(?:.|\n)*(<!-- RUNNER-CONFIG END -->)/m,
          `$1\n${await getDoc('runner-config')}\n$2`));

    await modifyRepoFile(
      path.join('ui', 'docs', 'reference', 'workers', 'worker-runner', 'providers.mdx'),
      async content => content
        .replace(
          /(<!-- PROVIDERS BEGIN -->)(?:.|\n)*(<!-- PROVIDERS END -->)/m,
          `$1\n${await getDoc('providers')}\n$2`));

    await modifyRepoFile(
      path.join('ui', 'docs', 'reference', 'workers', 'worker-runner', 'workers.mdx'),
      async content => content
        .replace(
          /(<!-- WORKERS BEGIN -->)(?:.|\n)*(<!-- WORKERS END -->)/m,
          `$1\n${await getDoc('workers')}\n$2`));

    await modifyRepoFile(
      path.join('ui', 'docs', 'reference', 'workers', 'worker-runner', 'logging.mdx'),
      async content => content
        .replace(
          /(<!-- LOGGING BEGIN -->)(?:.|\n)*(<!-- LOGGING END -->)/m,
          `$1\n${await getDoc('logging')}\n$2`));

    await rimraf(binary);
  },
});
