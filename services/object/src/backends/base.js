class Backend {
  constructor({ backendId, db, monitor, rootUrl, config }) {
    this.backendId = backendId;
    this.db = db;
    this.monitor = monitor;
    this.rootUrl = rootUrl;
  }

  /* NOTE:
   * `object` arguments to these methods are rows from `db.fns.get_object` or
   * equivalent.
   */

  /**
   * Set up this backend.
   *
   * Subclasses should override this.
   */
  async setup() {
  }

  /**
   * Negotiate the upload method based on the given proposed upload methods,
   * returning the `uploadMethod` property of the response payload.  This will
   * not be called for an empty `proposedUploadMethods`.
   *
   * Implementations may use taskcluster-lib-api's `reportError` method.
   */
  async createUpload(object, proposedUploadMethods) {
    return {};
  }

  /**
   * Finish an upload for the given object.  This is called during the
   * `finishUpload` API method, and is intended to support any finalization of
   * the data the caller uploaded.  It is *not* intended to be a validation
   * step: in general we assume that the caller has done the right thing, and
   * that anything it has done wrong will result in an object that can't be
   * downloaded.  But, implementations may use taskcluster-lib-api's
   * `reportError` method to report errors.
   */
  async finishUpload(object) {
    return;
  }

  /**
   * Get the set of download methods available for this object.  All backends
   * must support at least the `simple` method.
   *
   * Subclasses should override this.
   */
  async availableDownloadMethods(object) {
    return [];
  }

  /**
   * Return the backend-specific details required for a client to retrieve the
   * object.  The result is returned directly from the `startDownload` API
   * endpoint.
   *
   * The `method` argument is the selected method, and `params` is the value
   * of the corresponding property in the caller's `acceptDownloadMethods`.
   *
   * Subclasses should override this.
   */
  async startDownload(object, method, params) {
    throw new Error('startDownload is not implemented for this backend');
  }

  /**
   * Expire an object.  This should delete any resources used by the object.
   * Return `true` to signal that the object's resources have been deleted and
   * the database row can be removed.  If resource removal takes more than a
   * few hundred milliseconds, this function should initiate that process and
   * return false, prepared to be called again for the same object at a later
   * time (such as by the next object-expiration crontask run).
   */
  async expireObject(object) {
    throw new Error('expiration is not implemented for this backend');
  }
}

module.exports = { Backend };
