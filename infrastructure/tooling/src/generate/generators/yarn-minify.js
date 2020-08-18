const minify = require('yarn-minify');
const { gitLsFiles } = require('../../utils');

// Ignore packages while we slowly whittle away the requirements
const IGNORE = {
  'clients/client/yarn.lock': pkg => false,
  'clients/client-web/yarn.lock': pkg => false,
  'yarn.lock': pkg => true,
  'ui/yarn.lock': pkg => true,
  'workers/docker-worker/yarn.lock': pkg => true,
};

exports.tasks = [{
  title: 'Minify yarn.locks',
  provides: ['target-yarn-minify'],
  run: async (requirements, utils) => {
    let yarnlocks = (await gitLsFiles())
      .filter(file => file === 'yarn.lock' || file.endsWith('/yarn.lock'));

    for (let filename of yarnlocks) {
      minify(filename, { ignore: IGNORE[filename] });
    }
  },
}];
