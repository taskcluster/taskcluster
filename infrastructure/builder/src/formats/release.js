const path = require('path');
const fs = require('fs');

const MIN_VERSION = 1;
const VERSION = 1;

class Release {
  static empty() {
    const release = new Release();
    release.version = VERSION;
    release.services = [];

    return release;
  }

  static fromFile(releaseFile) {
    const release = new Release();
    Object.assign(release, JSON.parse(fs.readFileSync(releaseFile)));

    if (release.version < MIN_VERSION) {
      throw new Error(`'${releaseFile}' version is too old; ${release.version} < ${MIN_VERSION}`);
    }

    if (release.version > VERSION) {
      throw new Error(`'${releaseFile}' version is too new; ${release.version} > ${VERSION}`);
    }

    return release;
  }

  write(releaseFile) {
    const release = {
      version: this.version,
      services: this.services,
    };
    fs.writeFileSync(releaseFile, JSON.stringify(release, null, 2));
  }
};

exports.Release = Release;
