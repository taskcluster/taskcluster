const _ = require('lodash');
const util = require('util');
const fs = require('fs');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const git = require('simple-git/promise');
const libDocs = require('taskcluster-lib-docs');
const {gitClone, stampDir, dirStamped} = require('./utils');

const generateRepoTasks = ({tasks, baseDir, spec, cfg, name, cmdOptions}) => {
  const repository = _.find(spec.build.repositories, {name});

  tasks.push({
    title: `Repo ${name} - Clone`,
    provides: [
      `repo-${name}-dir`, // full path of the repository
      `repo-${name}-exact-source`, // exact source URL for the repository
    ],
    run: async (requirements, utils) => {
      const repoDir = path.join(baseDir, `repo-${name}`);
      const {exactRev, changed} = await gitClone({
        dir: repoDir,
        url: repository.source,
        utils,
      });

      const [repoUrl] = repository.source.split('#');
      const provides = {
        [`repo-${name}-dir`]: repoDir,
        [`repo-${name}-exact-source`]: `${repoUrl}#${exactRev}`,
      };

      if (changed) {
        return provides;
      } else {
        return utils.skip(provides);
      }
    },
  });

  if (!repository.docs || typeof repository.docs !== 'object') {
    return;
  }

  tasks.push({
    title: `Repo ${name} - Generate Docs`,
    requires: [
      `repo-${name}-dir`,
      `repo-${name}-exact-source`,
    ],
    provides: [
      `docs-${name}-dir`, // full path of the docs dir
    ],
    run: async (requirements, utils) => {
      // note that docs directory paths must have this form (${basedir}/docs is
      // mounted in docker images)
      const docsDir = path.join(baseDir, 'docs', name);
      const repoDir = requirements[`repo-${name}-dir`];
      const provides = {
        [`docs-${name}-dir`]: docsDir,
      };

      if (dirStamped({dir: docsDir, sources: requirements[`repo-${name}-exact-source`]})) {
        return utils.skip(provides);
      }

      await rimraf(docsDir);
      await mkdirp(path.dirname(docsDir));

      const documentor = await libDocs.documenter({
        project: name,
        readme: path.join(repoDir, 'README.md'),
        docsFolder: path.join(repoDir, 'docs'),
        tier: repository.docs.tier,
        menuIndex: repository.docs.menuIndex,
        publish: false,
      });
      await documentor.write({docsDir});

      stampDir({dir: docsDir, sources: requirements[`repo-${name}-exact-source`]});
      return provides;
    },
  });

  return tasks;
};

module.exports = generateRepoTasks;

