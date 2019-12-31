const os = require('os');
const util = require('util');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const {TaskGraph, Lock, ConsoleRenderer, LogRenderer} = require('console-taskgraph');
const generateMonoimageTasks = require('./monoimage');

class Build {
  constructor(cmdOptions) {
    this.cmdOptions = cmdOptions;

    this.baseDir = cmdOptions['baseDir'] || '/tmp/taskcluster-builder-build';
  }

  /**
   * Generate the tasks for `yarn build`.  The result is a set of tasks which
   * culminates in one providing `monoimage-docker-image`, a docker image path
   * for the resulting monoimage.  The tasks in this subgraph that clone and build the
   * repository depend on `build-can-start` (tasks to download docker images,
   * and other such preparatory work, can begin earlier)
   */
  generateTasks() {
    let tasks = [];

    generateMonoimageTasks({
      tasks,
      baseDir: this.baseDir,
      credentials: {
        // these are optional for `yarn build` but will always be supplied with
        // `yarn release`
        dockerUsername: process.env.DOCKER_USERNAME,
        dockerPassword: process.env.DOCKER_PASSWORD,
      },
      cmdOptions: this.cmdOptions,
    });

    return tasks;
  }

  async run() {
    if (!this.cmdOptions.cache) {
      await rimraf(this.baseDir);
    }
    await mkdirp(this.baseDir);

    let tasks = this.generateTasks();

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
    const context = await taskgraph.run({'build-can-start': true});

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

module.exports = {main, Build};
