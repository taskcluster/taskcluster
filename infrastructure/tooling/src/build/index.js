const path = require('path');
const os = require('os');
const util = require('util');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const {TaskGraph, Lock, ConsoleRenderer, LogRenderer} = require('console-taskgraph');
const generateMonoimageTasks = require('./monoimage');
const generateCommonTasks = require('./common');
const generateLivelogTasks = require('./livelog');
const {
  gitIsDirty,
  gitDescribe,
  REPO_ROOT,
} = require('../utils');

class Build {
  constructor(cmdOptions) {
    this.cmdOptions = cmdOptions;

    this.baseDir = cmdOptions['baseDir'] || '/tmp/taskcluster-builder-build';
    this.logsDir = cmdOptions['logsDir'] || path.join(this.baseDir, 'logs');
  }

  /**
   * Generate the tasks for `yarn build`.  The result is a set of tasks which
   * culminates in one providing `monoimage-docker-image`, a docker image path
   * for the resulting monoimage.  The tasks in this subgraph that clone and build the
   * repository depend on `build-can-start` (tasks to download docker images,
   * and other such preparatory work, can begin earlier)
   */
  generateTasks(generateFor) {
    let tasks = [];

    generateCommonTasks({
      tasks,
      baseDir: this.baseDir,
      logsDir: this.logsDir,
      credentials: {},
      cmdOptions: this.cmdOptions,
    });

    generateLivelogTasks({
      tasks,
      baseDir: this.baseDir,
      logsDir: this.logsDir,
      credentials: {},
      cmdOptions: this.cmdOptions,
    });

    generateMonoimageTasks({
      tasks,
      baseDir: this.baseDir,
      logsDir: this.logsDir,
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

  async getVersionInfo() {
    // The docker build clones from the current working copy, rather than anything upstream;
    // this avoids the need to land-and-push changes.  This is a git clone
    // operation instead of a raw filesystem copy so that any non-checked-in
    // files are not accidentally built into docker images.  But it does mean that
    // changes need to be checked in.
    if (!this.cmdOptions.ignoreUncommittedFiles) {
      if (await gitIsDirty({dir: REPO_ROOT})) {
        throw new Error([
          'The current git working copy is not clean. Any non-checked-in files will',
          'not be reflected in the built image, so this is treatd as an error by default.',
          'Either check in the dirty files, or run with --ignore-uncommitted-files to',
          'override this error.  Never check in files containing secrets!',
        ].join(' '));
      }
    }

    const {gitDescription, revision} = await gitDescribe({
      dir: REPO_ROOT,
    });

    return {
      'release-version': gitDescription.slice(1),
      'release-revision': revision,
    };
  }

  async run() {
    if (!this.cmdOptions.cache) {
      await rimraf(this.baseDir);
    }
    await mkdirp(this.baseDir);

    await rimraf(this.logsDir);
    await mkdirp(this.logsDir);

    let tasks = this.generateTasks('build');

    const taskgraph = new TaskGraph(tasks, {
      locks: {
        // limit ourselves to one docker process per CPU
        docker: new Lock(os.cpus().length),
        // and let's be sane about how many git clones we do..
        git: new Lock(8),
      },
      target: [
        'target-monoimage',
        'target-livelog',
      ],
      renderer: process.stdout.isTTY ?
        new ConsoleRenderer({elideCompleted: true}) :
        new LogRenderer(),
    });
    if (this.cmdOptions.dryRun) {
      console.log('Dry run successful.');
      return;
    }
    const context = await taskgraph.run({
      ...await this.getVersionInfo(),
      'build-can-start': true,
    });

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
