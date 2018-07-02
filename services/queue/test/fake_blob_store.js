/**
 * A fake version of the BlobStore class
 */
class FakeBlobStore {
  createContainer() {
    this.reset();
  }

  _reset() {
  }

  setupCORS() {
  }

  put(key, json) {
  }

  putIfNotExists(key, json) {
  }

  putOrMatch(key, json) {
  }

  get(key, nullIfNotFound) {
  }

  generateWriteSAS(key, options) {
  }

  createSignedGetUrl(key, options) {
  }

  deleteBlob(key, ignoreIfNotExists) {
  }
}

module.exports = FakeBlobStore;
