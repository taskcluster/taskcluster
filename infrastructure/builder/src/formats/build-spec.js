const yaml = require('js-yaml');
const path = require('path');
const fs = require('fs');

const VERSION = 1;
exports.VERSION = VERSION;

class BuildSpec {
  static fromDirectory(specDir) {
    const filename = path.join(specDir, 'main.yml');
    const spec = new BuildSpec();
    Object.assign(spec, yaml.safeLoad(fs.readFileSync(filename)));

    if (spec.version > VERSION) {
      throw new Error(`'${specDir}' version is too new; ${spec.version} > ${VERSION}`);
    }

    return spec;
  }
};

// hide the constructor
exports.BuildSpec = {
  fromDirectory: BuildSpec.fromDirectory,
};
