const yaml = require('js-yaml');
const path = require('path');
const fs = require('fs');

const VERSION = 1;

class BuildSpec {
  static fromDirectory(specFile) {
    const filename = path.join(specFile, 'main.yml');
    const spec = new BuildSpec()
    Object.assign(spec, yaml.safeLoad(fs.readFileSync(filename)));

    if (spec.version > VERSION) {
      throw new Error(`'${specFile}' version is too new; ${spec.version} > ${VERSION}`);
    }

    return spec;
  }
};

exports.BuildSpec = BuildSpec;
