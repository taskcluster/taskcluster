const assert = require('assert');
const IndexedImage = require('./indexed_image');
const TaskImage = require('./artifact_image');
const DockerImage = require('./docker_image');

const IMAGE_HANDLERS = {
  'indexed-image': IndexedImage,
  'task-image': TaskImage,
  'docker-image': DockerImage
};

/**
 * Image Manager is responsible for ensuring that an image is downloaded
 * and available for a task.  A secondary goal of the image manager is to ensure
 * that only one download of an image happens at a time.  Parallel downloads/loading
 * of docker images has been problematic.
 */
class ImageManager {
  /*
   * @param {Object} runtime - Runtime object that's typically created by the worker.
   *                           Requires a logging and docker instance.
   */
  constructor(runtime) {
    assert(runtime.docker, 'Docker instance must be provided');
    this.runtime = runtime;
    this.docker = runtime.docker;
    this.log = runtime.log;
    this._lastImageEnsured = null;
    //cache of hashes for task images that have been downloaded keyed
    //by taskId-artifactPath
    this.imageHashes = {};
  }

  /*
   * Ensures that an image is available for a task.  This image could be an indexed
   * image (type: indexed-image) or a docker image.
   *
   * Example Docker Image (backwards compatability):
   * imageDetails = 'ubuntu:14.04'
   *
   * Example Docker Image:
   * imageDetails = {
   *   type: 'docker-image',
   *   name: 'ubuntu:14.04'
   * }
   *
   * Example Indexed Image:
   * imageDetails = {
   *   type: 'indexed-image',
   *   namespace: 'public.images.ubuntu.14_04',
   *   path: 'public/image.tar'
   * }
   *
   *
   * @param {Object|String} imageDetails - Object or string represent
   *
   * @returns {Object} promise - Returns a promise that either is immediately resolved
   *                             or will be once image is downloaded.  Ensures
   *                             pulls/downloads are done serially.
   */
  async ensureImage(imageDetails, stream, task, scopes = []) {
    if (typeof imageDetails === 'string') {
      imageDetails = {
        name: imageDetails,
        type: 'docker-image'
      };
    }

    return this._lastImageEnsured = Promise.resolve(this._lastImageEnsured)
      .catch(() => {}).then(async () => {
        this.log('ensure image', {
          image: imageDetails
        });

        let imageHandler = this.getImageHandler(imageDetails, stream, task, scopes);

        if (!imageHandler.isAuthorized()) {
          throw new Error(
            `Not authorized to use ${JSON.stringify(imageDetails)}.  Ensure that ` +
            'the task scopes are correctly defined in the task definition'
          );
        }

        let exists = await imageHandler.imageExists();

        if (!exists) {
          let start = Date.now();
          await imageHandler.download();
          this.runtime.monitor.measure('task.image.totalLoadTime', Date.now() - start);
        }

        return imageHandler.imageId;
      });
  }

  /*
   * Creates the appropriate image handler for the 'type' requested.
   *
   * @param {Object} image  - Image details including 'type'
   * @param {Object} stream - Stream object used for piping messages to the task log
   * @param {Array}  scopes - Array of task scopes
   */
  getImageHandler(image, stream, task, scopes) {
    if (!Object.keys(IMAGE_HANDLERS).includes(image.type)) {
      throw new Error(`Unrecognized image type. Image Type: ${image.type}`);
    }

    return new IMAGE_HANDLERS[image.type](this.runtime, image, stream, task, scopes);
  }
}

module.exports = ImageManager;
