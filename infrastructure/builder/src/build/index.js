const fs = require('fs');
const Listr = require('listr');
const stringify = require('json-stable-stringify');
const {BuildService} = require('./service');
const {BuildSpec} = require('../formats/build-spec');
const {Release} = require('../formats/release');

class Build {
  constructor(specFile, releaseFile) {
    this.specFile = specFile;
    this.releaseFile = releaseFile;

    // TODO: make this customizable (but stable, so caching works)
    this.workDir = '/tmp/taskcluster-installer-build';

    // the BuildSpec and Release are available at these properties while
    // running
    this.spec = null;
    this.release = null;
  }

  _servicesTask() {
    return {
      title: 'Services',
      task: () => new Listr(
        this.spec.services.map(service => {
          const steps = new BuildService(this, service.name);
          return steps.task();
        }),
        {concurrent: 1}
      ),
    };
  }

  async run() {
    this.spec = await BuildSpec.fromDirectory(this.specFile);
    this.release = Release.empty();

    // TODO: if --no-cache, blow this away (noting it may contain root-owned stuff)
    if (!fs.existsSync(this.workDir)) {
      fs.mkdirSync(this.workDir);
    }

    const build = new Listr([
      this._servicesTask(),
    ], {concurrent: true});

    await build.run();
    this.release.write(this.releaseFile);
  }
}

const main = async (specFile, releaseFile) => {
  const build = new Build(specFile, releaseFile);
  await build.run();
};

module.exports = main;
