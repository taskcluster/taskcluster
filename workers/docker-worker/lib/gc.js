var EventEmitter = require('events').EventEmitter;
var parseImage = require('docker-image-parser');
var Promise = require('promise');
var debug = require('debug')('taskcluster-docker-worker:garbageCollector');
var exceedsDiskspaceThreshold = require('./util/capacity').exceedsDiskspaceThreshold;

async function getImageId(docker, imageName) {
  var dockerImages = await docker.listImages();
  var imageId;
  dockerImages.forEach(function (dockerImage) {
    if (dockerImage.RepoTags.indexOf(imageName) !== -1) {
      imageId = dockerImage.Id;
    }
  });
  return imageId;
}

function isContainerRunning(container) {
  return (container['Status'].indexOf('Exited') === -1);
}

async function isContainerStale(docker, container, expiration) {
  // Containers can be running, exited, or no status (created but not started).
  // For a container exited or never ran so has no status, inspect() returns
  // "running: false" and contains a FinishedAt timestamp so need to peek at
  // the status message of the container as well.  Only inpsect containers that
  // have "Exited"
  if (container['Status'].indexOf('Exited') === -1) return false;

  container = docker.getContainer(container.Id);
  container = await container.inspect();
  var finishedAt = Date.parse(container.State.FinishedAt);
  var containerExpiration = finishedAt + expiration;
  return (Date.now() > containerExpiration) ? true : false;
}

function GarbageCollector(config) {
  this.capacity = config.capacity;
  this.docker = config.docker;
  this.dockerVolume = config.dockerVolume;
  this.log = config.log;
  this.stats = config.stats;
  this.taskListener = config.taskListener;
  // Garbage collection interval in milliseconds
  this.interval = config.interval || 60 * 1000;
  // Minimum diskspace required per task in bytes
  this.diskspaceThreshold = config.diskspaceThreshold || 10 * 1000000000;
  // Time in milliseconds until image is considered expired
  this.imageExpiration = config.imageExpiration || 2 * 60 * 60 * 1000;
  this.containerExpiration = config.containerExpiration || 30 * 60 * 1000;
  this.markedContainers = {};
  this.ignoredContainers = [];
  this.markedImages = {};
  this.retries = 5;
  this.scheduleSweep(this.interval);
  this.managers = [];
  EventEmitter.call(this);
}

GarbageCollector.prototype = {
  __proto__: EventEmitter.prototype,

  addManager: function(manager) {
    this.managers.push(manager);
  },

  markImage: function(image) {
    var parsedImage = parseImage(image);
    var repository = parsedImage.repository;
    var tag = parsedImage.tag || 'latest';
    var imageName = repository + ':' + tag;

    var expiration = new Date(Date.now() + this.imageExpiration);
    this.markedImages[imageName] = expiration;
  },

  markStaleContainers: async function () {
    var containers = await this.docker.listContainers({all: true});
    for(let container of containers) {
      if (!(container.Id in this.markedContainers) &&
          (this.ignoredContainers.indexOf(container.Id) === -1)) {
          var stale = await isContainerStale(
            this.docker, container, this.containerExpiration
          );
          if (stale) {
            this.log('[alert-operator] stale container', {
              message: 'Container exited more than ' +
                       `${this.containerExpiration/1000} seconds ago. Marking ` +
                       'for removal',
              container: container.Id
            });

            this.removeContainer(container.Id);
          }
      }
    }
  },

  removeContainer: function (containerId, volumeCaches, devices) {
    this.markedContainers[containerId] = {
      retries: this.retries,
      caches: volumeCaches || [],
      devices: devices || []
    };
    this.emit('gc:container:marked', containerId);
    debug(`marked ${containerId}`);
  },

  removeContainers: async function () {
    for (var containerId in this.markedContainers) {
      // If a container can't be removed after 5 tries, more tries won't help
      if (this.markedContainers[containerId].retries !== 0) {
        var c = this.docker.getContainer(containerId);
        var caches = this.markedContainers[containerId].caches;

        try {
          await c.remove({
            // Even running containers should be removed otherwise shouldn't have
            // been marked for removal.
            force: true,
            // Any data volumes created by container should be removed too.
            // These can be created with VOLUME statement in dockerfile.
            // Tasks should use cache folders for caching things, though
            // VOLUME statements makes sense if you want a non-AUFS folder that
            // isn't persistent (AUFS can be slow for file intensive work)
            v: true
          });
          delete this.markedContainers[containerId];

          this.emit('gc:container:removed', {
            id: containerId,
            caches: caches
          });
          this.log('container removed', {
            container: containerId,
            caches: caches
          });
        } catch(e) {
          var message = e;
          if (e.reason === 'no such container') {
            delete this.markedContainers[containerId];

            message = 'No such container. Will remove from marked ' +
                      'containers list.';
            this.emit('gc:container:removed', {
              id: containerId,
              caches: caches
            });
          } else {
            this.markedContainers[containerId].retries -= 1;
          }

          this.emit('gc:container:error', {message: message, container: containerId});
          this.log('container removal error.',
                   {container: containerId, err: message});
        }
      } else {
        delete this.markedContainers[containerId];
        this.ignoredContainers.push(containerId);
        this.emit('gc:container:error',
                  {message: 'Retry limit exceeded', container: containerId});
        this.log('container removal error',
                 {container: containerId, err: 'Retry limit exceeded'});
      }
    }
  },

  removeUnusedImages: async function (exceedsThreshold) {
    // All containers that are currently managed by the daemon will not allow
    // an image to be removed.  Consider them all running
    var containers = await this.docker.listContainers({all: true});
    var runningImages = containers.map((container) => { return container.Image; });

    for (var image in this.markedImages) {
      var imageId = await getImageId(this.docker, image);
      var imageDetails = {name: image, id: imageId};
      if (!exceedsThreshold && this.markedImages[image] > new Date()) {
          this.emit('gc:image:info', {info:'Image expiration has not been reached.',
            image: imageDetails});
          continue;
      }

      if (runningImages.indexOf(image) === -1) {
        var dockerImage = this.docker.getImage(imageId);

        try {
          await dockerImage.remove();
          delete this.markedImages[image];
          this.emit('gc:image:removed', {image: imageDetails});
          this.log('image removed', {image: imageDetails});

        } catch (e) {
          var message = e;
          if (e.reason === 'no such image') {
            message = 'No such image. Will remove from marked images list.';
            delete this.markedImages[image];
          }

          this.emit('gc:image:error', {message: message, image: imageDetails});
          this.log('image removal error.',
                   {message: message, image: imageDetails});
        }
      } else {
        var warning = 'Cannot remove image while it is running.';
        this.emit('gc:image:warning', {message: warning, image: imageDetails});
        this.log('garbage collection warning',
                 {message: warning, image: imageDetails});
      }
    }
  },

  scheduleSweep: function (interval) {
    this.sweepTimeoutId = setTimeout(this.sweep.bind(this), interval);
  },

  sweep: async function () {
    clearTimeout(this.sweepTimeoutId);
    this.emit('gc:sweep:start');
    this.log('garbage collection started');
    await this.markStaleContainers();
    await this.removeContainers();

    // Worker should be capable of providing a minimum amount of diskspace for
    // each task its capable of claiming.  Images that are not running will be
    // removed if they are expired or if there is not enough diskspace remaining
    // for each available task the worker can claim.
    let availableCapacity = await this.taskListener.availableCapacity();
    var exceedsThreshold = await exceedsDiskspaceThreshold(this.dockerVolume,
                             this.diskspaceThreshold,
                             availableCapacity,
                             this.log,
                             this.stats);
    if (exceedsThreshold) {
      this.emit('gc:diskspace:warning',
                {message: 'Diskspace threshold reached. ' +
                          'Removing all non-running images.'
                });
    } else {
      this.emit('gc:diskspace:info',
                {message: 'Diskspace threshold not reached. ' +
                          'Removing only expired images.'
                });
    }
    await this.removeUnusedImages(exceedsThreshold);

    for (var i = 0; i < this.managers.length; i++) {
      await this.managers[i].clear(exceedsThreshold);
    }

    this.log('garbage collection finished');
    this.emit('gc:sweep:stop');
    this.scheduleSweep(this.interval);
  }
};

module.exports = GarbageCollector;
