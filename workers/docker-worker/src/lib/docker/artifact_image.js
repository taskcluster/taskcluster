const {createHash} = require('crypto');
const Debug = require('debug');
const fs = require('mz/fs');
const { spawn } = require('child_process');
const slugid = require('slugid');
const path = require('path');
const tarfs = require('tar-fs');
const {scopeMatch} = require('../scopes');
const pipe = require('promisepipe');

const {makeDir, removeDir} = require('../util/fs');
const {fmtLog} = require('../log');
const downloadArtifact = require('../util/artifact_download');
const sleep = require('../util/sleep');

let debug = Debug('docker-worker:artifactImage');

async function decompressLz4File(inputFile) {
  let outputFile = path.join(path.dirname(inputFile), path.basename(inputFile, '.lz4'));
  let proc = spawn('lz4', ['-d', inputFile, outputFile]);
  let err = [];
  proc.stderr.on('data', data => {
    err.push(data);
  });

  await new Promise((accept, reject) => {
    proc.on('error', reject);
    proc.on('exit', accept);
  });

  if (proc.exitCode !== 0) {
    throw new Error(
      'Could not decompress image file.' +
        `Exit Code: ${proc.exitCode} Errors: ${err.join('\n')}`);
  }
  return outputFile;
}

async function decompressZstdFile(inputFile) {
  let outputFile = path.join(path.dirname(inputFile), path.basename(inputFile, '.zst'));
  let proc = spawn('zstd', ['-d', inputFile, '-o', outputFile]);
  let err = [];
  proc.stderr.on('data', data => {
    err.push(data);
  });

  await new Promise((accept) => {
    proc.on('exit', accept);
  });

  if (proc.exitCode !== 0) {
    throw new Error(
      'Could not decompress image file.' +
        `Exit Code: ${proc.exitCode} Errors: ${err.join('\n')}`);
  }
  return outputFile;
}

/*
 * Image manager for task artifact images.
 */
class ArtifactImage {
  /*
   * @param {Object}  runtime       - Runtime object
   * @param {Object}  imageDetails  - Type, namespace, and path object
   * @param {Object}  stream        - task stream object
   * @param {Array}   taskScopes        - Array of task scopes
   */
  constructor(runtime, imageDetails, stream, task, taskScopes=[]) {
    this.runtime = runtime;
    this.taskScopes = taskScopes;
    this.stream = stream;
    this.taskId = imageDetails.taskId;
    this.artifactPath = imageDetails.path;
    this.task = task;
    this.knownHashes = this.runtime.imageManager.imageHashes;
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
    let tarballPath;
    let start = Date.now();
    let downloadDir = path.join(this.runtime.dockerVolume, 'tmp-docker-images', slugid.nice());
    await makeDir(downloadDir);

    let downloadedFile = path.join(downloadDir, path.basename(this.artifactPath));

    try {
      let hash = await downloadArtifact(
        this.task.queue,
        this.stream,
        this.taskId,
        this.artifactPath,
        downloadedFile,
        this.runtime.dockerConfig
      );
      this.runtime.monitor.measure('task.taskImage.downloadTime', Date.now() - start);

      switch (path.extname(downloadedFile)) {
      case '.lz4':
        this.stream.write(fmtLog('Decompressing downloaded image'));
        tarballPath = await decompressLz4File(downloadedFile);
        fs.unlink(downloadedFile);
        break;
      case '.zst':
        this.stream.write(fmtLog('Decompressing downloaded image'));
        tarballPath = await decompressZstdFile(downloadedFile);
        fs.unlink(downloadedFile);
        break;
      case '.tar':
        tarballPath = downloadedFile;
        break;
      default:
        throw new Error('Unsupported image file format. Expected tarball with extension: .tar.zst, .tar.lz4 or .tar');
      }

      await this.renameAndLoad(this.imageName, tarballPath);
      this.knownHashes[`${this.taskId}-${this.artifactPath}`] = hash;
      this.task.imageArtifactHash = hash;

    } catch(e) {
      debug(`Error loading docker image. ${e.stack}`);
      try {
        await removeDir(downloadDir);
      } catch(e) {
        debug(`Error removing download dir. ${e.stack}`);
      }
      throw new Error(`Error loading docker image. ${e.message}`);
    }

    this.runtime.monitor.measure('task.taskImage.loadTime', Date.now() - start);
    try {
      await removeDir(downloadDir);
    } catch(e) {
      debug(`Error removing download dir. ${e.stack}`);
    }
  }

  async renameAndLoad(imageName, originalTarball) {
    this.stream.write(fmtLog('Loading docker image from downloaded archive.'));
    debug('Renaming image and creating new archive');
    let newTarball = await this.renameImageInTarball(imageName, originalTarball);

    try {
      await fs.unlink(originalTarball);
    } catch(e) {
      debug(`Error when attempting to remove downloaded image. ${e.stack}`);
    }

    debug('Loading docker image');
    let readStream = fs.createReadStream(newTarball);
    await this.runtime.docker.loadImage(readStream);

    let pulledImage;
    for (let i = 0; i <= 5; i++) {
      pulledImage = await this.imageExists();

      if (pulledImage) {
        break;
      }

      await sleep(5000);
    }

    if (!pulledImage) {
      throw new Error('Image did not load properly.');
    }

    return pulledImage;
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
      if (this.knownHashes[`${this.taskId}-${this.artifactPath}`]) {
        this.task.imageArtifactHash = this.knownHashes[`${this.taskId}-${this.artifactPath}`];
      }

      this.stream.write(fmtLog(
        `Image '${this.artifactPath}' from task '${this.taskId}' ` +
        `loaded.  Using image ID ${this.imageId}.`
      ));

      return true;
    } catch(e) {
      delete this.knownHashes[`${this.taskId}-${this.artifactPath}`];
      if (e.statusCode === 404) {
        return false;
      }
      this.stream.write(fmtLog(`Error checking for image presence: ${e.message}`));
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
    let manifestPath = path.join(extractedPath, 'manifest.json');

    let extractStream = tarfs.extract(extractedPath);
    await pipe(fs.createReadStream(tarballPath), extractStream);

    let repositories = fs.readFileSync(path.join(extractedPath, 'repositories'));
    let repoInfo = JSON.parse(repositories);

    let keys = Object.keys(repoInfo);
    if (keys.length > 1) {
      throw new Error('Image tarballs must only contain one image');
    }

    let oldRepoName = keys[0];
    let oldTag = Object.keys(repoInfo[oldRepoName])[0];
    let newRepoInfo = {};
    newRepoInfo[imageName] = repoInfo[oldRepoName];

    if (oldTag !== 'latest') {
      newRepoInfo[imageName]['latest'] = newRepoInfo[imageName][oldTag];
      delete newRepoInfo[imageName][oldTag];
    }

    newRepoInfo = JSON.stringify(newRepoInfo);
    fs.writeFileSync(path.join(extractedPath, 'repositories'), newRepoInfo);

    if (fs.existsSync(manifestPath)) {
      let manifest = JSON.parse(fs.readFileSync(manifestPath));
      if (manifest.length > 1) {
        throw new Error('Image tarballs must only contain one image');
      }

      manifest[0]['RepoTags'] = [`${imageName}:latest`];
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    }

    let pack = tarfs.pack(path.join(dir, filename));
    await pipe(pack, fs.createWriteStream(editedTarballPath));

    try {
      await removeDir(extractedPath);
    } catch(e) {
      debug('Error removing temporary task image directory. ' +
            `Path: ${extractedPath}. Error: ${e.message}`);
    }

    return editedTarballPath;
  }
}

module.exports = ArtifactImage;
