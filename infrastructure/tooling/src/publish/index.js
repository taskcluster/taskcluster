const os = require('os');
const util = require('util');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const {TaskGraph, Lock, ConsoleRenderer, LogRenderer} = require('console-taskgraph');
const {Build} = require('../build');
const generatePublishTasks = require('./tasks');
const taskcluster = require('taskcluster-client');

class Publish {
  constructor(cmdOptions) {
    this.cmdOptions = cmdOptions;

    this.baseDir = cmdOptions['baseDir'] || '/tmp/taskcluster-builder-build';

    // The `yarn build` process is a subgraph of the publish taskgraph, with some
    // options "forced"
    this.build = new Build({
      ...cmdOptions,
      cache: false, // always build from scratch
    });
  }

  async generateTasks() {
    // try loading the secret into process.env
    if (process.env.TASKCLUSTER_PROXY_URL) {
      const secretName = "project/taskcluster/release";
      console.log(`loading secrets from taskcluster secret ${secretName} via taskcluster-proxy`);
      const secrets = new taskcluster.Secrets({rootUrl: process.env.TASKCLUSTER_PROXY_URL});
      const {secret} = await secrets.get(secretName);

      for (let [name, value] of Object.entries(secret)) {
        console.log(`..found value for ${name}`);
        process.env[name] = value;
      }
    }

    if (this.cmdOptions.push) {
      [
        'GH_TOKEN',
        'NPM_TOKEN',
        'PYPI_USERNAME',
        'PYPI_PASSWORD',
        'DOCKER_USERNAME',
        'DOCKER_PASSWORD',
      ].forEach(e => {
        if (!process.env[e]) {
          throw new Error(`$${e} is required (unless --no-push)`);
        }
      });
    }

    let tasks = this.build.generateTasks();
    generatePublishTasks({
      tasks,
      cmdOptions: this.cmdOptions,
      credentials: {
        ghToken: process.env.GH_TOKEN,
        npmToken: process.env.NPM_TOKEN,
        pypiUsername: process.env.PYPI_USERNAME,
        pypiPassword: process.env.PYPI_PASSWORD,
        dockerUsername: process.env.DOCKER_USERNAME,
        dockerPassword: process.env.DOCKER_PASSWORD,
      },
      baseDir: this.baseDir,
    });

    return tasks;
  }

  async run() {
    if (!this.cmdOptions.cache) {
      await rimraf(this.baseDir);
    }
    await mkdirp(this.baseDir);

    let tasks = await this.generateTasks();

    const taskgraph = new TaskGraph(tasks, {
      locks: {
        // limit ourselves to one docker process per CPU
        docker: new Lock(os.cpus().length),
        // and let's be sane about how many git clones we do..
        git: new Lock(8),
      },
      target: 'target-publish',
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
    console.log(`Release docker image: ${context['monoimage-docker-image']}`);
    if (!this.cmdOptions.push) {
      console.log('NOTE: image, git commit + tags, and packages not pushed due to --no-push option');
    } else {
      console.log(`GitHub release: ${context['github-release']}`);
    }
  }
}

const main = async (options) => {
  const publish = new Publish(options);
  await publish.run();
};

module.exports = {main, Publish};
