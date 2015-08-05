import Debug from 'debug';
import fs from 'mz/fs';
import path from 'path';
import Promise from 'promise';
import tar from 'tar-fs';
import taskcluster from 'taskcluster-client';
import slugid from 'slugid';
import uploadToS3 from '../upload_to_s3';
import waitForEvent from '../wait_for_event';
import zlib from 'zlib';

let debug = Debug('docker-worker:features:docker-save');

export default class DockerSave {
  //commits and uploads the docker image as an artifact
  async uploadContainer(task) {
    //temporary path for saved file
    let pathname = path.join(task.runtime.dockerVolume, slugid.v4() + '.tar');

    let {Id: imageId} = await task.dockerProcess.container.commit({
      repo: 'task-' + task.status.taskId + '-' + task.runId
    });
    let image = task.runtime.docker.getImage('task-' + task.status.taskId + '-' + task.runId + ':latest');
    let imgStream = await image.get();
    let zipStream = zlib.createGzip();
    imgStream.pipe(zipStream).pipe(fs.createWriteStream(pathname));
    await new Promise((accept, reject) => {
      zipStream.on('end', accept);
      zipStream.on('error', reject);
    });

    let stat = await fs.stat(pathname);
    let uploadStream = fs.createReadStream(pathname);
    let expiration = taskcluster.fromNow(task.runtime.dockerSave.expiration);

    await uploadToS3(task, uploadStream, 'public/dockerImage.tar', expiration, {
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
    let zipStream = tar.pack(cache.cacheLocation, { dereference: true }).pipe(zlib.createGzip());
    zipStream.pipe(fs.createWriteStream(pathname));
    await new Promise((accept, reject) => {
      zipStream.on('end', accept);
      zipStream.on('error', reject);
    });
    let expiration = taskcluster.fromNow(task.runtime.dockerSave.expiration);
    let stat = await fs.stat(pathname);

    await uploadToS3(task,
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

    await Promise.all(volumeCaches.map((cacheStr) => this.uploadCache(task, cacheStr).catch(err => error.push(err)))
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
