const {readFile, modifyFile, modifyJSON} = require('../util');

/**
 * Update the node version to match everywhere, treating that in `package.json`
 * as authoritative.
 */
exports.tasks = [{
  title: 'Node Version',
  provides: ['target-node-version'],
  run: async (requirements, utils) => {
    const nodeVersion = JSON.parse(await readFile('package.json')).engines.node;
    if (!nodeVersion || !nodeVersion.match(/[0-9.]+/)) {
      throw new Error(`invalid node version ${nodeVersion} in package.json`);
    }
    utils.step({title: `Setting node version ${nodeVersion}`});

    utils.status({message: '.taskcluster.yml'});
    await modifyFile('.taskcluster.yml',
      contents => contents.replace(
        /^( *node: ')[0-9.]+(')$/m,
        `$1${nodeVersion}$2`));

    utils.status({message: 'netlify.toml'});
    await modifyFile('netlify.toml',
      contents => contents.replace(
        /^( *NODE_VERSION *= *")[0-9.]+(")$/m,
        `$1${nodeVersion}$2`));

    utils.status({message: 'ui/package.json'});
    await modifyJSON('ui/package.json',
      contents => {
        contents.engines.node = nodeVersion;
        return contents;
      });
  },
}];
