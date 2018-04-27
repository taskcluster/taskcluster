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

    const deployFile = path.join(filename, 'deploy.yml');
    this.deploy = yaml.safeLoad(fs.readFileSync(deployFile));

    const ingressFile = path.join(filename, 'ingress.yml');
    this.ingress = yaml.safeLoad(fs.readFileSync(ingressFile));
  }

  _loadFile(filename) {
    const {build, deploy, ingress} = JSON.parse(fs.readFileSync(filename));
    this.build = build;
    this.deploy = deploy;
    this.ingress = ingress;
  }

  write(filename) {
    const content = {
      build: this.build,
      deploy: this.deploy,
      ingress: this.ingress,
    };
    fs.writeFileSync(filename, JSON.stringify(content, null, 2));
  }
};

exports.ClusterSpec = ClusterSpec;
