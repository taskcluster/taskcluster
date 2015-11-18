import Debug from 'debug';
import taskcluster from 'taskcluster-client';

import ArtifactImage from './artifact_image';

let debug = Debug('docker-worker:indexedImage');

/*
 * Image manager for indexed images.
 */
export default class IndexedImage extends ArtifactImage {
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
    this.namespace = imageDetails.namespace;
    this.artifactPath = imageDetails.path;
    this.index = new taskcluster.Index({
      credentials: this.runtime.taskcluster,
      authorizedScopes: this.taskScopes
    });
    this.queue = new taskcluster.Queue({
      credentials: this.runtime.taskcluster,
      authorizedScopes: this.taskScopes
    });
  }

  /* Downloads an image that is indexed at the given namespace and path.
   *
   * @returns {Object} - Image details
   */
  async download() {
    if (this.imageId) {
      return this.imageId;
    }

    this.taskId = await this.getTaskIdForImage();

    return await this._downloadArtifact();
  }

  /*
   * Retrieves a task ID for a given indexed namespace.
   *
   * @returns {String} taskId - ID of the indexed task.
   */
  async getTaskIdForImage() {
    if (this.taskId) {
      return this.taskId;
    }

    try {
      let {taskId} = await this.index.findTask(this.namespace);
      this.taskId = taskId;
      return taskId;
    } catch(e) {
      throw new Error(
        `Could not find a task associated with "${this.namespace}" ` +
        `namespace. ${e.message}`
      );
    }

    return this.taskId;
  }

  /*
   * Checks to see if the image has already been downloaded and loaded into
   * docker.
   *
   * @returns {Boolean|Object} Returns false if image does not exist, or an object
   *                           containing image details if it does.
   */
  async imageExists() {
    this.taskId = await this.getTaskIdForImage();
    return await this._checkIfImageExists();
  }


}
