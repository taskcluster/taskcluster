const _ = require('lodash');
const util = require('util');
const fs = require('fs');
const path = require('path');
const Listr = require('listr');
const {ClusterSpec} = require('../formats/cluster-spec');
const config = require('typed-env-config');
const jsone = require('json-e');
const mkdirp = util.promisify(require('mkdirp'));
const rimraf = util.promisify(require('rimraf'));

class Deploy {
  constructor(input, output, infraInfo) {
    this.input = input;
    this.output = output;
    this.infraInfo = infraInfo;

    this.spec = null;
    this.cfg = null;
  }

  _readInputs() {
    this.spec = new ClusterSpec(this.input);
    this.infra = JSON.parse(fs.readFileSync(this.infraInfo));
    this.cfg = config({
      files: [
        'deploy-config.yml',
        'user-deploy-config.yml',
      ],
      env:      process.env,
    });
  }

  _renderResources() {
    const contextFunctions = {
      builtService: name => {
        const service = _.find(this.spec.build.services, {name});
        if (!service) {
          throw new Error(`builtService: unkonwn service ${name}`);
        }
        return service;
      },
    };

    const context = {
      cfg: this.cfg,
      infra: this.infra,
      build: this.spec.build,
      ...contextFunctions,
    };
    this.resources = jsone(this.spec.deploy, context).resources;
  }

  async _writeResults() {
    await rimraf(this.output);
    await mkdirp(this.output);
    this.resources.forEach(resource => {
      const filename = path.join(this.output, `${resource.kind}-${resource.name}.json`);
      delete resource.name;
      fs.writeFileSync(filename, JSON.stringify(resource, null, 2));
    });
  }

  async run() {
    const deploy = new Listr([{
      title: 'Read Inputs',
      task: () => this._readInputs(),
    }, {
      title: 'Render Resources',
      task: () => this._renderResources(),
    }, {
      title: 'Write Results',
      task: () => this._writeResults(),
    }]);

    await deploy.run();
  }
}

const main = async (input, output, infraInfo) => {
  const deploy = new Deploy(input, output, infraInfo);
  await deploy.run();
};

module.exports = main;
