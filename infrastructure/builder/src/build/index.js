const fs = require('fs');
const Listr = require('listr');
const stringify = require('json-stable-stringify');
const {BuildService} = require('./service');
const {ClusterSpec} = require('../formats/cluster-spec');
const config = require('typed-env-config');

class Build {
  constructor(input, output) {
    this.input = input;
    this.output = output;

    // TODO: make this customizable (but stable, so caching works)
    this.workDir = '/tmp/taskcluster-installer-build';

    this.spec = null;
    this.cfg = null;
  }

  _servicesTask() {
    return {
      title: 'Services',
      task: () => new Listr(
        this.spec.build.services.map(service => {
          const steps = new BuildService(this, service.name);
          return steps.task();
        }),
        {concurrent: 1}
      ),
    };
  }

  async run() {
    this.spec = new ClusterSpec(this.input);
    this.cfg = config({
      files: [
        'build-config.yml',
        'user-build-config.yml',
      ],
      env:      process.env,
    });

    // TODO: if --no-cache, blow this away (noting it may contain root-owned stuff)
    if (!fs.existsSync(this.workDir)) {
      fs.mkdirSync(this.workDir);
    }

    const build = new Listr([
      this._servicesTask(),
    ], {concurrent: true});

    await build.run();
    this.spec.write(this.output);
  }
}

const main = async (input, output) => {
  const build = new Build(input, output);
  await build.run();
};

module.exports = main;
