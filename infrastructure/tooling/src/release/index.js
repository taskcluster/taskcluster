const os = require('os');
const {TaskGraph, Lock, ConsoleRenderer, LogRenderer} = require('console-taskgraph');
const generateReleaseTasks = require('./tasks');

class Release {
  constructor(cmdOptions) {
    this.cmdOptions = cmdOptions;
  }

  generateTasks() {
    const tasks = [];

    generateReleaseTasks({
      tasks,
      cmdOptions: this.cmdOptions,
    });

    return tasks;
  }

  async run(staging) {
    let tasks = this.generateTasks();

    const taskgraph = new TaskGraph(tasks, {
      locks: {
        // limit ourselves to one docker process per CPU
        docker: new Lock(os.cpus().length),
        // and let's be sane about how many git clones we do..
        git: new Lock(8),
      },
      target: staging ? 'target-staging-release' : 'target-release',
      renderer: process.stdout.isTTY ?
        new ConsoleRenderer({elideCompleted: true}) :
        new LogRenderer(),
    });
    if (this.cmdOptions.dryRun) {
      console.log('Dry run successful.');
      return;
    }
    const context = await taskgraph.run();

    console.log(`Release version: ${context['release-version']}`);
    if (staging) {
      console.log(`Pushed to ${context['target-staging-release']}`);
    } else if (!this.cmdOptions.push) {
      console.log('NOTE: image, git commit + tags, and packages not pushed due to --no-push option');
    }
  }
}

const main = async (options) => {
  const release = new Release(options);
  await release.run(false);
};

const stagingRelease = async (options) => {
  const release = new Release(options);
  await release.run(true);
};

module.exports = {main, stagingRelease, Release};
