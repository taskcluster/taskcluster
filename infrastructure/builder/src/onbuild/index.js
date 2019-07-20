const {writeRepoJSON, gitDescribe, REPO_ROOT} = require('../utils');

const main = async (options) => {

  const {gitDescription, revision} = await gitDescribe({
    dir: REPO_ROOT,
    utils: null,
  });

  await writeRepoJSON('version.json', {
    source: "https://github.com/taskcluster/taskcluster",
    version: gitDescription,
    commit: revision,
    build: 'NONE',
  });
};

module.exports = {main};
