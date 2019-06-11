const os = require('os');
const {TaskGraph, Lock, ConsoleRenderer, LogRenderer} = require('console-taskgraph');
const {Build} = require('../build');
const generateReleaseTasks = require('./tasks');

class Release {
  constructor(version, cmdOptions) {
    this.version = version;
    this.cmdOptions = cmdOptions;

    // The `yarn build` process is a subgraph of the release taskgraph, with some
    // options "forced"
    this.build = new Build({
      ...cmdOptions,
      push: true, // always push the resuting image
      noCache: true, // always build from scratch
    });
  }

  /**
   * Generate the tasks for `yarn build`.  The result is a set of tasks which
   * culminates in one providing `monoimage-docker-image`, a docker image path
   * for the resulting monoimage.  The tasks in this subgraph that clone and build the
   * repository depend on `build-can-start` (tasks to download docker images,
   * and other such preparatory work, can begin earlier)
   */
  generateTasks() {
    let tasks = this.build.generateTasks();

    generateReleaseTasks({
      tasks,
      version: this.version,
      cmdOptions: this.cmdOptions,
    });

    return tasks;
  }

  async run() {
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
    const context = await taskgraph.run();

    console.log(`Release docker image: ${context['monoimage-docker-image']}`);
  }
}

const main = async (version, options) => {
  const release = new Release(version, options);
  await release.run();
};

module.exports = {main, Release};
