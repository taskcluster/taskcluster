var path = require('path');
var fs = require('fs');
const {makeDir, removeDir} = require('./util/fs');
var taskcluster = require('taskcluster-client');
var uuid = require('uuid');
var _ = require('lodash');

var KEY_DELIMITER = '::';

function sortInstanceIds(cache) {
  var instanceIds = Object.keys(cache);
  var sorted = instanceIds.sort(function (a, b) {
    if (cache[a].lastUsed < cache[b].lastUsed) return 1;
    if (cache[a].lastUsed > cache[b].lastUsed) return -1;

    return 0;
  });

  return sorted;
}

/**
Cache manager for volumes that can be reused between containers. Cached volumes
will be indexed based on timestamps and reused in the order of most recently used.

@constructor
@param {Object} configuration settings for the volume cache manager
*/
class VolumeCache {
  constructor(config) {
    this.config = config;
    this.rootCachePath = config.cache.volumeCachePath;
    this.log = config.log;
    this.cache = {};
    this.monitor = config.monitor;
    this.purgeClient = new taskcluster.PurgeCache({
      rootUrl: config.rootUrl,
    });
    this.lastPurgeRequest = new Date();
  }

  /**
  Add a cached volume along with an optional instancePath.  Cached volume will
  be marked as not mounted until otherwise specified.

  @param {String} Name of the cached volume.
  @param {String} Option path for the cached volume.
  @return {Object} Cached volume instance that is not mounted.
  */
  async add(cacheName, instancePath) {
    var instanceId = uuid.v4();

    if (!instancePath) {
      var cachePath = path.join(this.rootCachePath, cacheName);
      instancePath = path.join(cachePath, instanceId);
    }

    if (!fs.existsSync(instancePath)) {
      await makeDir(instancePath);
    }

    var created = Date.now();

    this.cache[cacheName][instanceId] = {
      path: instancePath,
      mounted: false,
      created: created,
      lastUsed: created,
      purge: false
    };

    // Create a cache key that can be used by consumers of the cache in the
    // forma of <cache name>::<instance id>
    var instance = {key: cacheName + KEY_DELIMITER + instanceId,
      path: instancePath,
      lastUsed: created
    };
    return instance;
  }

  async removeCacheVolume(cacheName, instance) {
    var cacheKey = cacheName + KEY_DELIMITER + instance;
    var instancePath = this.cache[cacheName][instance].path;
    // Remove instance from the list of managed caches so another worker
    // does not try to claim it.
    delete this.cache[cacheName][instance];
    try {
      await removeDir(instancePath);
      this.log('cache volume removed', {
        key: cacheKey, path: instancePath
      });
    }
    catch (e) {
      this.log('[alert-operator] volume cache removal error', {
        message: 'Could not remove volume cache directory',
        err: e,
        stack: e.stack
      });
    }
  }

  /**
  Remove any unmounted volumes when diskspace threshold is reached. This will
  be called at each garbage collection interval.

  @param {Boolean} Disksapce threshold reached
  */
  async clear(exceedsDiskspaceThreshold) {
    await this.doPurge();

    if (!exceedsDiskspaceThreshold) return;
    for (var cacheName in this.cache) {
      for (var instance in this.cache[cacheName]) {
        if (!this.cache[cacheName][instance].mounted) {
          await this.removeCacheVolume(cacheName, instance);
        }
      }
    }
  }

  /**
  Begin tracking the particular volume cache and create the necessary
  local directories.

  @param {String} Name of the cached volume.
  */
  async createCacheVolume(cacheName) {
    var cachePath = path.join(this.rootCachePath, cacheName);
    this.cache[cacheName] = {};

    if(fs.existsSync(cachePath)) {
      await makeDir(cachePath);
      var cacheDetails = {cacheName: cacheName, cachPath: cachePath};
      this.log('cache volume created', cacheDetails);
    }
  }

  /**
  Get the instance for the particular cached volume.  If no instance that is not
  mounted exists, a new one will be created.

  @param {String} Name of the cached volume.
  @return {Object} Cached volume instance.
  */
  async get(cacheName) {
    if (cacheName.includes(KEY_DELIMITER)) {
      throw new Error('Invalid key name was provided.  Ensure that the cache ' +
        'name does not contain "' + KEY_DELIMITER + '".');
    }

    var instanceId;

    if (!this.cache[cacheName]) {
      await this.createCacheVolume(cacheName);
    } else {
      var instanceIds = sortInstanceIds(this.cache[cacheName]);
      for (var i = 0; i < instanceIds.length; i++) {
        var id = instanceIds[i];
        let instance = this.cache[cacheName][id];
        if (!instance.mounted && !instance.purge) {
          instanceId = id;
          instance.mounted = true;
          instance.lastUsed = Date.now();
          break;
        }
      }
    }

    var instance;
    var logMessage = '';

    if (!instanceId) {
      logMessage = 'cache volume miss';
      instance = await this.add(cacheName);
      this.set(instance.key, {mounted: true});
      this.monitor.count('cache.miss');
    } else {
      logMessage = 'cache volume hit';
      instance = {key: cacheName + KEY_DELIMITER + instanceId,
        path: this.cache[cacheName][instanceId].path,
        lastUsed: this.cache[cacheName][instanceId].lastUsed
      };
      this.monitor.count('cache.hit');
    }
    this.log(logMessage, instance);
    return instance;
  }

  /**
  Release the claim on a cached volume.  Cached volume should only be released
  once a container has been completed removed. Local cached volume will remain
  on the filesystem to be used by the next container/task.

  @param {String} Cache key in the format of <cache name>::<instance id>
  */
  async release(cacheKey) {
    this.set(cacheKey, {mounted: false, lastUsed: Date.now()});
    this.log('cache volume release', {key: cacheKey});
  }

  purgeInstance(cacheKey) {
    this.set(cacheKey, {purge: true});
    this.log('cache volume purge', {key: cacheKey});
  }

  /**
  Set a property for a cached volume.

  @param {String} Cache key in the format of <cache name>::<instance id>
  @param {Object} Key name and value for the property to be set.
  */
  async set(cacheKey, value) {
    var cacheName = cacheKey.split(KEY_DELIMITER)[0];
    var instanceId = cacheKey.split(KEY_DELIMITER)[1];
    for (var key in value) {
      this.cache[cacheName][instanceId][key] = value[key];
    }
  }

  /**
  Get the name and location of a cache on disk.

  @param {String} Cache key in the format of <cache name>::<instance id>
  */
  getCacheDetails(cacheKey) {
    var cacheSplit = cacheKey.split(KEY_DELIMITER);
    return({
      cacheName: cacheSplit[0],
      cacheLocation: path.join(this.rootCachePath, cacheSplit[0], cacheSplit[1] + '/')
    });
  }

  /**
   Try to remove caches marked for purge.
   */
  async doPurge() {
    _.forOwn(this.cache, (cache, cacheName) => {
      _.forOwn(cache, async (instance, instanceid) => {
        if (instance.purge && !instance.mounted) {
          await this.removeCacheVolume(cacheName, instanceid);
        }
      });
    });
  }

  /**
   Mark cache for purge and try to remove it.

   @param cacheName {String} Name of the cache.
   */
  purge(cacheName, before) {
    _.forOwn(this.cache[cacheName], (instance) => {
      // Only purge caches that were created before the time specified
      if (instance.created < new Date(before).getTime()) {
        instance.purge = true;
      }
    });
  }

  /**
   * Set the time to give to the purge cache service so that only purge requests
   * created after the time are returned.  A 5 minute skew is added to prevent
   * clock drift and purge request races.
   */
  setNextPurgeRequestTime() {
    let nextRequest = new Date();
    nextRequest.setMinutes(nextRequest.getMinutes() - 5);
    this.lastPurgeRequest = nextRequest.toJSON();
  }

  async purgeCaches() {
    // If there are no caches, no need to make a request
    if (Object.keys(this.cache).length === 0) {
      this.setNextPurgeRequestTime();
      return;
    }

    // Not being able to reach the purge cache service would effectively make
    // all workers zombies and not claim tasks.  Rather than have workers get into this
    // state, let's be optimistic that if the worker can't reach the service,
    // it can still continue on.
    let purgeRequests;
    try {
      purgeRequests = await this.purgeClient.purgeRequests(this.config.provisionerId,
        this.config.workerType,
        {since: this.lastPurgeRequest});
      this.setNextPurgeRequestTime();
    } catch (e) {
      // Report the error, but do not set the last request time if this current
      // interval failed
      this.monitor.reportError(e, 'warning');
      return;
    }

    for (let request of purgeRequests.requests) {
      this.purge(request.cacheName, request.before);
    }
  }
}

module.exports = VolumeCache;
