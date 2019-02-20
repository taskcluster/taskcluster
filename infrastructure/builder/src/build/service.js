const fs = require('fs');
const path = require('path');
const {dockerPush} = require('./utils');
const {herokuBuildpackTasks} = require('./service/heroku-buildpack');

const generateServiceTasks = ({tasks, baseDir, spec, cfg, name, cmdOptions}) => {
  const repository = spec.build.repositories.find(r => r.name === name);
  const workDir = path.join(baseDir, `service-${name}`);
  if (!fs.existsSync(workDir)) {
    fs.mkdirSync(workDir);
  }

  switch (repository.service.buildtype) {
  case 'heroku-buildpack':
    herokuBuildpackTasks({tasks, baseDir, spec, cfg, name, cmdOptions, repository, workDir});
    break;

  default:
    throw new Error(`Unknown buildtype ${repository.service.buildtype}`);
  }

  tasks.push({
    title: `Service ${name} - Push Image`,
    requires: [
      `service-${name}-docker-image`,
      `service-${name}-image-on-registry`,
    ],
    provides: [
      `target-service-${name}`,
    ],
    run: async (requirements, utils) => {
      const tag = requirements[`service-${name}-docker-image`];
      const provides = {[`target-service-${name}`]: tag};

      if (!cmdOptions.push) {
        return utils.skip({provides});
      }

      if (requirements[`service-${name}-image-on-registry`]) {
        return utils.skip({provides});
      }

      await dockerPush({
        logfile: `${workDir}/docker-push.log`,
        tag,
        utils,
        baseDir,
      });

      return provides;
    },
  });
};

module.exports = generateServiceTasks;
