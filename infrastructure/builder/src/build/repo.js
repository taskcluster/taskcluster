const util = require('util');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const libDocs = require('taskcluster-lib-docs');
const Stamp = require('./stamp');
const {gitClone, ensureTask} = require('./utils');

const generateRepoTasks = ({tasks, baseDir, spec, cfg, name, cmdOptions}) => {
  const repository = spec.build.repositories.find(r => r.name === name);

  ensureTask(tasks, {
    title: `Repo ${name} - Clone`,
    provides: [
      `repo-${name}-dir`, // full path of the repository
      `repo-${name}-exact-source`, // exact source URL for the repository
      `repo-${name}-stamp`,
    ],
    locks: ['git'],
    run: async (requirements, utils) => {
      // using an external git repository, so clone that
      const repoDir = path.join(baseDir, `repo-${name}`);
      const source = repository.source;
      const {exactRev, changed} = await gitClone({
        dir: repoDir,
        url: source,
        utils,
      });

      const [repoUrl] = source.split('#');
      const stamp = new Stamp({step: 'repo-clone', version: 1},
        `${repoUrl}#${exactRev}`);

      const provides = {
        [`repo-${name}-dir`]: repoDir,
        [`repo-${name}-exact-source`]: `${repoUrl}#${exactRev}`,
        [`repo-${name}-stamp`]: stamp,
      };

      if (changed) {
        return provides;
      } else {
        return utils.skip({provides});
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
      `repo-${name}-stamp`,
    ],
    provides: [
      `docs-${name}-dir`, // full path of the docs dir
      `docs-${name}-stamp`,
    ],
    run: async (requirements, utils) => {
      // note that docs directory paths must have this form (${basedir}/docs is
      // mounted in docker images)
      const docsDir = path.join(baseDir, 'docs', name);
      const repoDir = requirements[`repo-${name}-dir`];

      const stamp = new Stamp({step: 'repo-docs', version: 1},
        {config: repository.docs},
        requirements[`repo-${name}-stamp`]);
      const provides = {
        [`docs-${name}-dir`]: docsDir,
        [`docs-${name}-stamp`]: stamp,
      };

      if (stamp.dirStamped(docsDir)) {
        return utils.skip({provides});
      }

      await rimraf(docsDir);
      await mkdirp(path.dirname(docsDir));

      const documentor = await libDocs.documenter({
        projectName: repository.docs.projectName || name,
        readme: path.join(repoDir, 'README.mdx'),
        docsFolder: path.join(repoDir, 'docs'),
        tier: repository.docs.tier,
        menuIndex: repository.docs.menuIndex,
        publish: false,
      });
      await documentor.write({docsDir});

      stamp.stampDir(docsDir);
      return provides;
    },
  });

  return tasks;
};

module.exports = generateRepoTasks;
