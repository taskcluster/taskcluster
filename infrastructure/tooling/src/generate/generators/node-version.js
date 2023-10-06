import {
  readRepoFile,
  modifyRepoFile,
  writeRepoFile,
  modifyRepoJSON,
  modifyRepoYAML,
} from '../../utils';

/**
 * Update the node version to match everywhere, treating that in `package.json`
 * as authoritative.
 */
export const tasks = [{
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

    utils.status({ message: 'Dockerfile' });
    await modifyRepoFile('Dockerfile',
      contents => contents.replace(
        /^FROM node:[0-9.]+(.*)$/gm,
        `FROM node:${nodeVersion}$1`));

    utils.status({ message: 'workers/docker-worker/test/images/test/Dockerfile' });
    await modifyRepoFile('workers/docker-worker/test/images/test/Dockerfile',
      contents => contents.replace(
        /^FROM node:[0-9.]+(.*)$/gm,
        `FROM node:${nodeVersion}$1`));

    utils.status({ message: 'ui/Dockerfile' });
    await modifyRepoFile('ui/Dockerfile',
      contents => contents.replace(
        /^FROM node:[0-9.]+(.*)$/gm,
        `FROM node:${nodeVersion}$1`));

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
    ].forEach(file => {
      utils.status({ message: file });
      modifyRepoJSON(file,
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
}];
