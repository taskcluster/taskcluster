const { Transform } = require('stream');
const { createHash } = require('crypto');

// The subset of hashes supported by HashStream which are "accepted" as per the
// object service's schemas.
const ACCEPTABLE_HASHES = new Set(["sha256", "sha512"]);

/**
 * A stream that hashes the bytes passing through it
 */
class HashStream extends Transform {
  constructor() {
    super();
    this.sha256 = createHash('sha256');
    this.sha512 = createHash('sha512');
    this.bytes = 0;
  }

  _transform(chunk, enc, cb) {
    this.sha256.update(chunk);
    this.sha512.update(chunk);
    this.bytes += chunk.length;
    cb(null, chunk);
  }

  // Return the calculated hashes in a format suitable for finishUpload,
  // checking that the content length matches the bytes hashed, if given.
  hashes(contentLength) {
    if (contentLength !== undefined && contentLength !== this.bytes) {
      throw new Error(`Hashed ${this.bytes} bytes but content length is ${contentLength}`);
    }
    return {
      sha256: this.sha256.digest('hex'),
      sha512: this.sha512.digest('hex'),
    };
  }
}

module.exports = { HashStream, ACCEPTABLE_HASHES };
