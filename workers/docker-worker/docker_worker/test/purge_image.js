var Promise = require('promise');

/**
Docker utility to purge all traces of a particular image (including containers).
*/

function purgeContainers(docker, repo) {
  return docker.listContainers({ all: true }).then(
    function(containers) {
      var list = [];

      containers.forEach(function(container) {
        if (container.Image.indexOf(repo) === -1) return;

        container = docker.getContainer(container.Id);
        list.push(container.remove());
      });

      return Promise.all(list);
    }
  );

}

function purgeImages(docker, repo) {
  return docker.listImages({ filter: repo }).then(
    function(images) {
      var list = images.map(function(image) {
        return docker.getImage(image.Id).remove();
      });
      return Promise.all(list);
    }
  );
}

function purge(docker, repo) {
  return purgeContainers(docker, repo).then(purgeImages.bind(this, docker, repo));
}

module.exports = purge;
