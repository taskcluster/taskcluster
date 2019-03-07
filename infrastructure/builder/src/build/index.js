const os = require('os');
const util = require('util');
const path = require('path');
const config = require('taskcluster-lib-config');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const {TerraformJson} = require('../formats/tf-json');
const {TaskGraph, Lock, ConsoleRenderer, LogRenderer} = require('console-taskgraph');
const generateRepoTasks = require('./repo');
const generateMonoimageTasks = require('./monoimage');

class Build {
  constructor(cmdOptions) {
    this.cmdOptions = cmdOptions;

    this.baseDir = cmdOptions['baseDir'] || '/tmp/taskcluster-builder-build';

    this.cfg = null;
  }

  async run() {
    this.cfg = config({
      files: [
        'build-config.yml',
        'user-build-config.yml',
      ],
      env: process.env,
    });

    if (this.cmdOptions.noCache) {
      await rimraf(this.baseDir);
    }
    await mkdirp(this.baseDir);

    let tasks = [];

    generateMonoimageTasks({
      tasks,
      baseDir: this.baseDir,
      cfg: this.cfg,
      cmdOptions: this.cmdOptions,
    });

    const taskgraph = new TaskGraph(tasks, {
      locks: {
        // limit ourselves to one docker process per CPU
        docker: new Lock(os.cpus().length),
        // and let's be sane about how many git clones we do..
        git: new Lock(8),
      },
      renderer: process.stdout.isTTY ?
        new ConsoleRenderer({elideCompleted: true}) :
        new LogRenderer(),
    });
    if (this.cmdOptions.dryRun) {
      console.log('Dry run successful.');
      return;
    }
    const context = await taskgraph.run();

    // create a TerraformJson output based on the result of the build
    const tfJson = new TerraformJson(context);
    // ..and write it out
    tfJson.write();
  }
}

const main = async (options) => {
  const build = new Build(options);
  await build.run();
};

module.exports = main;
