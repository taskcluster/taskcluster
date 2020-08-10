const { dockerImages, dockerPull } = require('./docker');

// add a task to tasks only if it isn't already there
exports.ensureTask = (tasks, task) => {
  if (!tasks.find(t => t.title === task.title)) {
    tasks.push(task);
  }
};

// ensure a docker image is present (setting `docker-image-${image}`)
exports.ensureDockerImage = (tasks, baseDir, image) => {
  exports.ensureTask(tasks, {
    title: `Pull Docker Image ${image}`,
    requires: [],
    locks: ['docker'],
    provides: [
      `docker-image-${image}`,
    ],
    run: async (requirements, utils) => {
      const images = await dockerImages({ baseDir });
      const exists = images.some(i => i.RepoTags && i.RepoTags.indexOf(image) !== -1);
      if (exists) {
        return utils.skip({ provides: {
          [`docker-image-${image}`]: image,
        } });
      }

      await dockerPull({ image, utils, baseDir });
      return {
        [`docker-image-${image}`]: image,
      };
    },
  });
};
