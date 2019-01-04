const yaml = require('js-yaml');
const path = require('path');
const fs = require('fs');

/**
 * A ClusterSpec represents the specification for a cluster.
 *
 * It can be loaded from a directory of (human-writable) YAML files.
 *
 * Currently it consists of only a build.yml file, but that may be
 * expanded in the future.
 */
class ClusterSpec {
  constructor(filename) {
    const buildFile = path.join(filename, 'build.yml');
    this.build = yaml.safeLoad(fs.readFileSync(buildFile));
  }
}

exports.ClusterSpec = ClusterSpec;
