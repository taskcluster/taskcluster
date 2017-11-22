const Debug = require('debug');
const fs = require('mz/fs');
const path = require('path');
const tar = require('tar-fs');
const taskcluster = require('taskcluster-client');
const slugid = require('slugid');
const uploadToS3 = require('../upload_to_s3');
const zlib = require('zlib');
const pipe = require('promisepipe');

let debug = Debug('docker-worker:features:docker-save');

function createImageName(taskId, runId) {
  return `${taskId.toLowerCase().replace('_', '-')}-${runId}`;
}

class DockerSave {
  constructor() {
    this.featureName = 'dockerSave';
  }
  //commits and uploads the docker image as an artifact
  async uploadContainer(task) {
    let imageName = createImageName(task.status.taskId, task.runId);
    //temporary path for saved file
    let pathname = path.join(task.runtime.dockerVolume, slugid.v4() + '.tar');

    await task.dockerProcess.container.commit({
      // repo name must be lower case and not contain underscores
      repo: imageName
    });
    let image = await task.runtime.docker.getImage(`${imageName}:latest`);
    let imgStream = await image.get();
    let zipStream = zlib.createGzip();
    const output = fs.createWriteStream(pathname);
    await pipe(imgStream, zipStream, output);

    let stat = await fs.stat(pathname);
    let uploadStream = fs.createReadStream(pathname);
    let expiration = taskcluster.fromNow(task.runtime.dockerSave.expiration);
    expiration = new Date(Math.min(expiration, new Date(task.task.expires)));

    await uploadToS3(task.queue, task.status.taskId, task.runId,
      uploadStream, 'public/dockerImage.tar', expiration, {
        'content-type': 'application/x-tar',
        'content-length': stat.size,
        'content-encoding': 'gzip'
      });

    debug('docker image uploaded');

    await image.remove();
    //cleanup
    fs.unlink(pathname).catch((err) => {
      task.runtime.log('[alert-operator] could not delete cache save tarball, worker may run out of hdd space\r\n'
        + err + err.stack);
    });
  }

  //uploading a cache folder as an artifact
  async uploadCache(task, cacheStr) {
    let cache = task.runtime.volumeCache.getCacheDetails(cacheStr);

    //temporary path for saved file
    let pathname = path.join(task.runtime.dockerVolume, slugid.v4() + '.tar');
    const output = fs.createWriteStream(pathname);
    await pipe(
      tar.pack(cache.cacheLocation, { dereference: true }),
      zlib.createGzip(),
      output
    );

    let expiration = taskcluster.fromNow(task.runtime.dockerSave.expiration);
    expiration = new Date(Math.min(expiration, new Date(task.task.expires)));
    let stat = await fs.stat(pathname);

    await uploadToS3(task.queue, task.status.taskId, task.runId,
      fs.createReadStream(pathname),
      'public/cache/' + cache.cacheName + '.tar',
      expiration, {
        'content-type': 'application/x-tar',
        'content-length': stat.size,
        'content-encoding': 'gzip'
      });

    debug('%s uploaded', cache.cacheName);

    //cleanup
    fs.unlink(pathname).catch((err) => {
      task.runtime.log('[alert-operator] could not delete cache save tarball, worker may run out of hdd space\r\n'
        + err + err.stack);
    });
  }

  async killed(task) {
    let errors = [];
    let volumeCaches = task.volumeCaches || [];

    await Promise.all(volumeCaches.map((cacheStr) => this.uploadCache(task, cacheStr).catch(err => err.push(err)))
      .concat(this.uploadContainer(task).catch((err) => errors.push(err))));

    if (errors.length > 0) {
      let errorStr = 'cache could not be uploaded: ';
      errors.map((err) => {
        errorStr = errorStr + err + err.stack;
      });
      debug(errorStr);
      throw new Error(errorStr);
    }
  }
}

module.exports = DockerSave;
