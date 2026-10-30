import {
  readRepoJSON,
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
  run: async (_requirements, utils) => {
    const nodeVersion = (await readRepoJSON('package.json')).engines.node;
    if (!nodeVersion?.match(/[0-9.]+/)) {
      throw new Error(`invalid node version ${nodeVersion} in package.json`);
    }
    utils.step({ title: `Setting node version ${nodeVersion}` });

    utils.status({ message: '.taskcluster.yml' });
    await modifyRepoFile('.taskcluster.yml', contents =>
      contents.replace(/^( *node: ')[0-9.]+(')$/m, `$1${nodeVersion}$2`)
    );

    for (const file of [
      'Dockerfile',
      'ui/Dockerfile',
      'taskcluster/docker/browser-test/Dockerfile',
      'taskcluster/docker/ci/Dockerfile',
      'taskcluster/docker/rabbit-test/Dockerfile',
    ]) {
      utils.status({ message: file });
      await modifyRepoFile(file, contents =>
        contents.replace(/^FROM node:[0-9.]+(.*)$/gm, `FROM node:${nodeVersion}$1`)
      );
    }

    utils.status({ message: '.nvmrc' });
    await writeRepoFile('.nvmrc', `${nodeVersion}\n`);

    utils.status({ message: 'dev-docs/development-process.md' });
    await modifyRepoFile('dev-docs/development-process.md', contents =>
      contents.replace(/Node version [0-9.]+/, `Node version ${nodeVersion}`)
    );

    utils.status({ message: 'netlify.toml' });
    await modifyRepoFile('netlify.toml', contents =>
      contents.replace(/^( *NODE_VERSION *= *")[0-9.]+(")$/m, `$1${nodeVersion}$2`)
    );

    for (const file of ['ui/package.json', 'clients/client-test/package.json']) {
      utils.status({ message: file });
      await modifyRepoJSON(file, contents => {
        contents.engines.node = nodeVersion;
        return contents;
      });
    }

    // Relax the engine requirement for published packages
    utils.status({ message: 'clients/client/package.json' });
    await modifyRepoJSON('clients/client/package.json', contents => {
      contents.engines.node = `^${nodeVersion.split('.')[0]}`;
      return contents;
    });

    utils.status({ message: 'cloudbuild.yaml' });
    await modifyRepoYAML('cloudbuild.yaml', contents => {
      contents.substitutions._NODE_VERSION = nodeVersion;
      return contents;
    });
  },
});

/**
 * Update the corepack version to match everywhere, treating that in
 * `.corepack-version` as authoritative. Node.js stopped bundling corepack in
 * v25, so every environment that runs `corepack` installs it from npm.
 */
tasks.push({
  title: 'Corepack Version',
  // cloudbuild.yaml is also rewritten by the Node Version task
  requires: ['target-node-version'],
  provides: ['target-corepack-version'],
  run: async (_requirements, utils) => {
    const corepackVersion = (await readRepoFile('.corepack-version')).trim();
    if (!corepackVersion.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)) {
      throw new Error(`invalid corepack version ${corepackVersion} in .corepack-version`);
    }
    utils.step({ title: `Setting corepack version ${corepackVersion}` });

    for (const file of [
      'Dockerfile',
      'ui/Dockerfile',
      'cloudbuild.yaml',
      'taskcluster/docker/browser-test/Dockerfile',
      'taskcluster/docker/ci/Dockerfile',
      'taskcluster/docker/rabbit-test/Dockerfile',
      'taskcluster/src/release.py',
    ]) {
      utils.status({ message: file });
      await modifyRepoFile(file, contents => contents.replace(/corepack@[0-9.]+/g, `corepack@${corepackVersion}`));
    }
  },
});

/**
 * Update the yarn version to match everywhere, treating that in `package.json`
 * as authoritative.
 */
tasks.push({
  title: 'Yarn Version',
  provides: ['target-yarn-version'],
  run: async (_requirements, utils) => {
    const yarnVersion = (await readRepoJSON('package.json')).packageManager;
    if (!yarnVersion?.match(/yarn@[0-9.]+/)) {
      throw new Error(`invalid yarn version ${yarnVersion} in package.json`);
    }
    utils.step({ title: `Setting yarn version ${yarnVersion}` });

    for (const file of ['ui/package.json']) {
      utils.status({ message: file });
      await modifyRepoJSON(file, contents => {
        contents.packageManager = yarnVersion;
        return contents;
      });
    }
  },
});
