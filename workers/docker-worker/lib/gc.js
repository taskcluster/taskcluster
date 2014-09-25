var co = require('co');
var EventEmitter = require('events').EventEmitter;
var diskspace = require('diskspace');
var parseImage = require('docker-image-parser');
var Promise = require('promise');

function exceedsDiskspaceThreshold(mnt, threshold, availableCapacity, log) {
  return new Promise(function (accept, reject) {
    diskspace.check(mnt, function (err, total, free, status) {
        var used = total-free;
        var capacity = (100*(used/total)).toPrecision(5);
        log('diskspace check', {
          volume: mnt,
          total: total,
          used: total - free,
          available: free,
          pctUsed: capacity,
        });

        var thresholdReached = free <= (threshold * availableCapacity);
        if (thresholdReached) {
          log('diskspace threshold reached', {
            free: free,
            perTaskThreshold: threshold,
            availableWorkerCapacity: availableCapacity,
            totalthreshold: threshold * availableCapacity
          });
        }
        accept(thresholdReached);
    });
  });
}

function* getImageId(docker, imageName) {
  var dockerImages = yield docker.listImages();
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

function isContainerStale(container) {
  var s = container['Status'];
  // Do not consider containers with a blank status as stale.  Race between
  // creating and starting a container.
  return (s.indexOf('Exited') === 0);
}

function GarbageCollector(config) {
  this.capacity = config.capacity;
  this.docker = config.docker;
  this.dockerVolume = config.dockerVolume;
  this.log = config.log;
  this.taskListener = config.taskListener;
  // Garbage collection interval in milliseconds
  this.interval = config.interval || 60 * 1000;
  // Minimum diskspace required per task in bytes
  this.diskspaceThreshold = config.diskspaceThreshold || 10 * 1000000000;
  // Time in milliseconds until image is considered expired
  this.imageExpiration = config.imageExpiration || 2 * 60 * 60 * 1000;
  this.markedContainers = {};
  this.ignoredContainers = [];
  this.markedImages = {};
  this.retries = 5;
  this.scheduleSweep(this.interval);
  EventEmitter.call(this);
}

GarbageCollector.prototype = {
  __proto__: EventEmitter.prototype,

  markImage: function(image) {
    var parsedImage = parseImage(image);
    var repository = parsedImage.repository;
    var tag = parsedImage.tag || 'latest';
    var imageName = repository + ':' + tag;

    var expiration = new Date(Date.now() + this.imageExpiration);
    this.markedImages[imageName] = expiration;
  },

  markStaleContainers: function* () {
    var containers = yield this.docker.listContainers({all: true});
    containers.forEach(function (container) {
      if (!(container.Id in this.markedContainers) &&
          (this.ignoredContainers.indexOf(container.Id) === -1) &&
          isContainerStale(container)) {
        this.removeContainer(container.Id);
      }
    }.bind(this));
  },

  removeContainer: function (containerId) {
    this.markedContainers[containerId] = this.retries;
    this.emit('gc:container:marked', containerId);
  },

  removeContainers: function* () {
    for (var containerId in this.markedContainers) {
      // If a container can't be removed after 5 tries, more tries won't help
      if (this.markedContainers[containerId] !== 0) {
        var c = this.docker.getContainer(containerId);

        try {
          // Even running containers should be removed otherwise shouldn't have
          // been marked for removal.
          yield c.remove({force: true});
          delete this.markedContainers[containerId];
          this.emit('gc:container:removed', containerId);
          this.log('container removed', {container: containerId});
        } catch(e) {
          var message = e;
          if (e.reason === 'no such container') {
              message = 'No such container. Will remove from marked ' +
                        'containers list.';
              delete this.markedContainers[containerId];
          } else {
            this.markedContainers[containerId] -= 1;
          }

          this.emit('gc:error', {message: message, container: containerId});
          this.log('container removal error.',
                   {container: containerId, err: message});
        }
      } else {
        delete this.markedContainers[containerId];
        this.ignoredContainers.push(containerId);
        this.emit('gc:error',
                  {message: 'Retry limit exceeded', container: containerId});
        this.log('container removal error',
                 {container: containerId, err: 'Retry limit exceeded'});
      }
    }
  },

  removeUnusedImages: function* (exceedsThreshold) {
    var containers = yield this.docker.listContainers({all: true});
    var runningImages = containers.filter(isContainerRunning)
      .map(function(container) {
        return container.Image;
      });

    for (var image in this.markedImages) {
      var imageId = yield getImageId(this.docker, image);
      var imageDetails = {name: image, id: imageId};
      if (!exceedsThreshold && this.markedImages[image] > new Date()) {
          this.emit('gc:image:info', {info:'Image expiration has not been reached.',
            image: imageDetails});
          continue;
      }

      if (runningImages.indexOf(image) === -1) {
        var dockerImage = this.docker.getImage(imageId);

        try {
          yield dockerImage.remove();
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

  sweep: function () {
    clearTimeout(this.sweepTimeoutId);
    this.emit('gc:sweep:start');
    this.log('garbage collection started');
    co(function* () {
      yield this.markStaleContainers();
      yield this.removeContainers();

      // Worker should be capable of providing a minimum amount of diskspace for
      // each task its capable of claiming.  Images that are not running will be
      // removed if they are expired or if there is not enough diskspace remaining
      // for each available task the worker can claim.
      if (this.capacity - this.taskListener.pending > 0) {
        var exceedsThreshold = yield exceedsDiskspaceThreshold(this.dockerVolume,
                                 this.diskspaceThreshold,
                                 (this.capacity - this.taskListener.pending),
                                 this.log);
        if (exceedsThreshold) {
          this.emit('gc:warning',
                    {message: 'Diskspace threshold reached. ' +
                              'Removing all non-running images.'
                    });
        } else {
          this.emit('gc:info',
                    {message: 'Diskspace threshold not reached. ' +
                              'Removing only expired images.'
                    });
        }
        yield this.removeUnusedImages(exceedsThreshold);
      }

      this.log('garbage collection finished');
      this.emit('gc:sweep:stop');
    }).bind(this)();
    this.scheduleSweep(this.interval);
  }
};

module.exports = GarbageCollector;
