const yaml = require('js-yaml');
const path = require('path');
const fs = require('fs');

/**
 * A ClusterSpec represents the specification for a cluster.
 *
 * It can be loaded either from a directory (human-writable) or a JSON file
 * (machine-made).  It can be written only to JSON.
 */
class ClusterSpec {
  constructor(filename) {
    const stat = fs.statSync(filename);
    if (stat.isDirectory()) {
      this._loadDirectory(filename);
    } else {
      this._loadFile(filename);
    }
  }

  _loadDirectory(filename) {
    const buildFile = path.join(filename, 'build.yml');
    this.build = yaml.safeLoad(fs.readFileSync(buildFile));
  }

  _loadFile(filename) {
    const {build} = JSON.parse(fs.readFileSync(filename));
    if (build.locals) {
      this.build = JSON.parse(build.locals.installer_info);
    } else {
      this.build = build;
    }
  }

  write(filename) {
    const format = path.basename(filename).split('.').slice(1).join('.');
    if (format === 'json') {
      const content = {
        build: this.build,
      };
      fs.writeFileSync(filename, JSON.stringify(content, null, 2));
    } else if (format === 'tf.json') {
      const locals = {
        installer_info: JSON.stringify(this.build),
      };
      const content = {
        locals: this.build.repositories.reduce((o, b) => {
          if (b.service) {
            o[`taskcluster_image_${b.name}`] = b.service.dockerImage;
          }
          return o;
        }, locals),
      };
      fs.writeFileSync(filename, JSON.stringify(content, null, 2));
    } else {
      throw new Error(`Unrecognized format ${format}`);
    }
  }
};

exports.ClusterSpec = ClusterSpec;
