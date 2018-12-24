const util = require('util');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const tar = require('tar-fs');
const {serviceDockerImageTask} = require('../utils');

exports.referencesTasks = ({tasks, baseDir, spec, cfg, name, cmdOptions, repository, workDir}) => {
  const docNames = spec.build.repositories.filter(repo => repo.docs).map(repo => repo.name);

  // This service has its own Dockerfile, so we just run the `docker build`.
  serviceDockerImageTask({tasks, baseDir, workDir, cfg, name,
    requires: [
      `repo-${name}-stamp`,
      `repo-${name}-dir`,
      ...docNames.map(name => `docs-${name}-dir`),
      ...docNames.map(name => `docs-${name}-stamp`),
    ],
    makeTarball: (requirements, utils) => {
      const repoDir = requirements[`repo-${name}-dir`];

      return tar.pack(repoDir, {
        finalize: false,
        finish: pack => {
          // all of the docs are in baseDir/docs, so just use that as input/.
          tar.pack(path.join(baseDir, 'docs'), {
            map: header => {
              header.name = `input/${header.name}`;
              return header;
            },
            pack,
          });
        },
      });
    },
  });
};
