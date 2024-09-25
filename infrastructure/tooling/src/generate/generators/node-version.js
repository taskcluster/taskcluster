import {
  readRepoFile,
  modifyRepoFile,
  writeRepoFile,
  modifyRepoJSON,
  modifyRepoYAML,
} from '../../utils/index.js';

export const tasks = [];

/**
 * Update the node version to match everywhere, treating that in `package.json`
 * as authoritative.
 */
tasks.push({
  title: 'Node Version',
  provides: ['target-node-version'],
  run: async (requirements, utils) => {
    const nodeVersion = JSON.parse(await readRepoFile('package.json')).engines.node;
    if (!nodeVersion || !nodeVersion.match(/[0-9.]+/)) {
      throw new Error(`invalid node version ${nodeVersion} in package.json`);
    }
    utils.step({ title: `Setting node version ${nodeVersion}` });

    utils.status({ message: '.taskcluster.yml' });
    await modifyRepoFile('.taskcluster.yml',
      contents => contents.replace(
        /^( *node: ')[0-9.]+(')$/m,
        `$1${nodeVersion}$2`));

    [
      'Dockerfile',
      'workers/docker-worker/test/images/test/Dockerfile',
      'ui/Dockerfile',
      'taskcluster/docker/browser-test/Dockerfile',
      'taskcluster/docker/ci/Dockerfile',
      'taskcluster/docker/rabbit-test/Dockerfile',
    ].forEach(async file => {
      utils.status({ message: file });
      await modifyRepoFile(file,
        contents => contents.replace(
          /^FROM node:[0-9.]+(.*)$/gm,
          `FROM node:${nodeVersion}$1`));
    });

    utils.status({ message: '.nvmrc' });
    await writeRepoFile('.nvmrc', nodeVersion + '\n');

    utils.status({ message: 'dev-docs/development-process.md' });
    await modifyRepoFile('dev-docs/development-process.md',
      contents => contents.replace(
        /Node version [0-9.]+/,
        `Node version ${nodeVersion}`));

    utils.status({ message: 'netlify.toml' });
    await modifyRepoFile('netlify.toml',
      contents => contents.replace(
        /^( *NODE_VERSION *= *")[0-9.]+(")$/m,
        `$1${nodeVersion}$2`));

    [
      'ui/package.json',
      'workers/docker-worker/package.json',
      'clients/client/package.json',
      'clients/client-test/package.json',
    ].forEach(async file => {
      utils.status({ message: file });
      await modifyRepoJSON(file,
        contents => {
          contents.engines.node = nodeVersion;
          return contents;
        });
    });

    utils.status({ message: 'cloudbuild.yaml' });
    await modifyRepoYAML('cloudbuild.yaml',
      contents => {
        contents.substitutions._NODE_VERSION = nodeVersion;
        return contents;
      });
  },
});

/**
 * Update the yarn version to match everywhere, treating that in `package.json`
 * as authoritative.
 */
tasks.push({
  title: 'Yarn Version',
  provides: ['target-yarn-version'],
  run: async (requirements, utils) => {
    const yarnVersion = JSON.parse(await readRepoFile('package.json')).packageManager;
    if (!yarnVersion || !yarnVersion.match(/yarn@[0-9.]+/)) {
      throw new Error(`invalid yarn version ${yarnVersion} in package.json`);
    }
    utils.step({ title: `Setting yarn version ${yarnVersion}` });

    [
      'ui/package.json',
      'workers/docker-worker/package.json',
    ].forEach(file => {
      utils.status({ message: file });
      modifyRepoJSON(file,
        contents => {
          contents.packageManager = yarnVersion;
          return contents;
        });
    });
  },
});
