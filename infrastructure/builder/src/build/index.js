const os = require('os');
const util = require('util');
const config = require('taskcluster-lib-config');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const {TaskGraph, Lock, ConsoleRenderer, LogRenderer} = require('console-taskgraph');
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
        {path: 'build-config.yml', required: true},
        {path: 'user-build-config.yml', required: false},
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
        // limit ourselves to one docker overall
        docker: new Lock(1),
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

    console.log(`Monoimage docker image: ${context['monoimage-docker-image']}`);
    if (!this.cmdOptions.push) {
      console.log('  NOTE: image not pushed (use --push)');
    }
  }
}

const main = async (options) => {
  const build = new Build(options);
  await build.run();
};

module.exports = main;
