const {readRepoFile, modifyRepoFile, modifyRepoJSON} = require('../../utils');

/**
 * Update the node version to match everywhere, treating that in `package.json`
 * as authoritative.
 */
exports.tasks = [{
  title: 'Node Version',
  provides: ['target-node-version'],
  run: async (requirements, utils) => {
    const nodeVersion = JSON.parse(await readRepoFile('package.json')).engines.node;
    if (!nodeVersion || !nodeVersion.match(/[0-9.]+/)) {
      throw new Error(`invalid node version ${nodeVersion} in package.json`);
    }
    utils.step({title: `Setting node version ${nodeVersion}`});

    utils.status({message: '.taskcluster.yml'});
    await modifyRepoFile('.taskcluster.yml',
      contents => contents.replace(
        /^( *node: ')[0-9.]+(')$/m,
        `$1${nodeVersion}$2`));

    utils.status({message: 'Dockerfile'});
    await modifyRepoFile('Dockerfile',
      contents => contents.replace(
        /^FROM node:[0-9.]+(.*)$/gm,
        `FROM node:${nodeVersion}$1`));

    utils.status({message: 'dev-docs/development-process.md'});
    await modifyRepoFile('dev-docs/development-process.md',
      contents => contents.replace(
        /Node version [0-9.]+/,
        `Node version ${nodeVersion}`));

    utils.status({message: 'netlify.toml'});
    await modifyRepoFile('netlify.toml',
      contents => contents.replace(
        /^( *NODE_VERSION *= *")[0-9.]+(")$/m,
        `$1${nodeVersion}$2`));

    utils.status({message: 'ui/package.json'});
    await modifyRepoJSON('ui/package.json',
      contents => {
        contents.engines.node = nodeVersion;
        return contents;
      });

    utils.status({message: 'workers/docker-worker/package.json'});
    await modifyRepoJSON('workers/docker-worker/package.json',
      contents => {
        contents.engines.node = nodeVersion;
        return contents;
      });
  },
}];
