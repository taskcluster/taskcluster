const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {isEqual, cloneDeep} = require('lodash');
const stableStringify = require('json-stable-stringify');

/**
 * Represents a "stamp" for a build step, encapsulating all of the inputs
 * to that step
 */
class Stamp {
  /**
   * Create a new stamp.  The given version is an integer giving the version of this
   * step; bump that if the step implementation changes.  The remaining arguments are
   * the inputs to this step, either other Stamp objects or arbitrary data.
   */
  constructor({step, version}, ...inputs) {
    this.data = [{step, version}];
    inputs.forEach(input => {
      if (input instanceof Stamp) {
        this.data.push(cloneDeep(input.data));
      } else {
        this.data.push(cloneDeep(input));
      }
    });
  }

  /**
   * Get a hash of this stamp
   */
  hash() {
    return crypto.createHash('sha256')
      .update(stableStringify(this.data), 'utf-8')
      .digest('hex')
      .slice(0, 12);
  }

  /**
   * Mark this directory as having been generated with this stamp.  Call this when
   * the step is complete.
   */
  stampDir(dir) {
    const sourcesFile = path.join(dir, '.sources.json');
    fs.writeFileSync(sourcesFile, stableStringify(this.data));
  }

  /**
   * Return true if the given directory has already been generated with a
   * matching stamp.
   */
  dirStamped(dir) {
    if (!fs.existsSync(dir)) {
      return false;
    }

    const sourcesFile = path.join(dir, '.sources.json');
    if (!fs.existsSync(sourcesFile)) {
      return false;
    }

    const foundData = JSON.parse(fs.readFileSync(sourcesFile, {encoding: 'utf-8'}));
    if (!isEqual(foundData, this.data)) {
      return false;
    }

    return true;
  }
}

module.exports = Stamp;
