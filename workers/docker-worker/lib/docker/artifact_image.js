import {createHash} from 'crypto';
import Debug from 'debug';
import fs from 'mz/fs';
import slugid from 'slugid';
import {Transform} from 'stream';
import path from 'path';
import tarfs from 'tar-fs';
import taskcluster from 'taskcluster-client';
import { scopeMatch } from 'taskcluster-base/utils';

import {makeDir, removeDir} from '../util/fs';
import { fmtLog, fmtErrorLog } from '../log';
import downloadArtifact from '../util/artifact_download';
import sleep from '../util/sleep';

let debug = Debug('docker-worker:artifactImage');

/*
 * Image manager for task artifact images.
 */
export default class ArtifactImage {
  /*
   * @param {Object}  runtime       - Runtime object
   * @param {Object}  imageDetails  - Type, namespace, and path object
   * @param {Object}  stream        - task stream object
   * @param {Array}   taskScopes        - Array of task scopes
   */
  constructor(runtime, imageDetails, stream, taskScopes=[]) {
    this.runtime = runtime;
    this.taskScopes = taskScopes;
    this.stream = stream;
    this.taskId = imageDetails.taskId;
    this.artifactPath = imageDetails.path;
    this.queue = new taskcluster.Queue({
      credentials: this.runtime.taskcluster,
      authorizedScopes: this.taskScopes
    });
  }

  /*
   * Verifies that the task is authorized to use the image.  Authorization is
   * only required for non-public artifacts (those not prefixed iwth "public/"
   *
   * @returns {Boolean}
   */
  isAuthorized() {
    if (/^[/]?public\//.test(this.artifactPath)) {
      return true;
    }

    return scopeMatch(this.taskScopes, [[`queue:get-artifact:${this.artifactPath}`]]);
  }


  /* Downloads an image at the given task ID and path.
   *
   * @returns {Object} - Image details
   */
  async download() {
    if (this.imageId) {
      return this.imageId;
    }

    return await this._downloadArtifact();
  }

  async _downloadArtifact() {
    let downloadDir = path.join(this.runtime.dockerVolume, 'tmp-docker-images', slugid.nice());
    await makeDir(downloadDir);

    let originalTarball = path.join(downloadDir, 'image.tar');

    let newTarball;
    try {
      await downloadArtifact(
        this.queue,
        this.stream,
        this.taskId,
        this.artifactPath,
        originalTarball,
        this.runtime.dockerConfig
      );

    } catch(e) {
      await removeDir(downloadDir);
      debug(`Error loading docker image. ${e.stack}`);
      throw new Error(`Error loading docker image. ${e.message}`);
    }

    this.stream.write(fmtLog('Loading docker image from downloaded archive.'));
    debug('Renaming image and creating new archive');
    newTarball = await this.renameImageInTarball(this.imageName, originalTarball);

    debug('Loading docker image');
    let readStream = fs.createReadStream(newTarball);
    await this.runtime.docker.loadImage(readStream);


    for (let i = 0; i <= 5; i++) {
      let pulledImage = await this.imageExists();

      if (pulledImage) {
        return pulledImage;
      }

      await sleep(5000);
    }

    await removeDir(downloadDir);
    throw new Error('Image could not be found after downloading');
  }

  /*
   * Creates a md5 hash of the image details to be used for uniquely identifying
   * this image when saving/loading within docker.
   *
   * @returns {String} - md5 hashed image name
   */
  get imageName() {
    return createHash('md5')
             .update(`${this.taskId}${this.artifactPath}`)
             .digest('hex');

  }

  async _checkIfImageExists() {
    try {
      let image = await this.runtime.docker.getImage(this.imageName);
      let imageDetails = await image.inspect();
      this.imageId = imageDetails.Id;

      this.stream.write(fmtLog(
        `Image '${this.artifactPath}' from task '${this.taskId}' ` +
        `downloaded.  Using image ID ${this.imageId}.`
      ));

      return imageDetails;
    } catch(e) {
      return false;
    }
  }

  /*
   * Checks to see if the image has already been downloaded and loaded into
   * docker.
   *
   * @returns {Boolean|Object} Returns false if image does not exist, or an object
   *                           containing image details if it does.
   */
  async imageExists() {
    return await this._checkIfImageExists(this.imageName);
  }

  /*
   * Given a docker image tarball, the repositories file within the tarball
   * will be overwritten with a unique name used for tagging the image when calling
   * 'docker load'
   *
   * @param {String} imageName - New name of the image
   * @param {String} tarballPath - Path to the docker image tarball
   *
   * @returns {String} Path to the new tarball
   */
  async renameImageInTarball(imageName, tarballPath) {
    let dir = path.dirname(tarballPath);
    let filename = path.basename(tarballPath, '.tar');
    let editedTarballPath = path.join(dir, filename + '-edited.tar');
    let extractedPath = path.join(dir, filename);

    let extractStream = tarfs.extract(extractedPath);
    fs.createReadStream(tarballPath).pipe(extractStream);

    await new Promise((accept, reject) => {
      extractStream.on('finish', accept);
      extractStream.on('error', reject);
    });

    let repositories = fs.readFileSync(path.join(extractedPath, 'repositories'));
    let repoInfo = JSON.parse(repositories);

    let oldRepoName = Object.keys(repoInfo)[0];
    let oldTag = Object.keys(repoInfo[oldRepoName])[0];
    let newRepoInfo = {};
    newRepoInfo[imageName] = repoInfo[oldRepoName];

    if (oldTag !== 'latest') {
      newRepoInfo[imageName]['latest'] = newRepoInfo[imageName][oldTag];
      delete newRepoInfo[imageName][oldTag];
    }

    newRepoInfo = JSON.stringify(newRepoInfo);
    fs.writeFileSync(path.join(extractedPath, 'repositories'), newRepoInfo);

    let pack = tarfs.pack(path.join(dir, filename));
    pack.pipe(fs.createWriteStream(editedTarballPath));
    await new Promise((accept, reject) => {
      pack.on('end', accept);
      pack.on('error', reject);
    });

    return editedTarballPath;
  }
}
