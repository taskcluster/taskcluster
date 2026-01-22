import path from 'path';
import os from 'os';
import { rimraf } from 'rimraf';
import mkdirp from 'mkdirp';
import taskcluster from '@taskcluster/client';
import { TaskGraph, Lock, ConsoleRenderer, LogRenderer } from 'console-taskgraph';
import { generateTasks } from './tasks/index.js';
import { gitIsDirty, gitDescribe, REPO_ROOT } from '../utils/index.js';

class Base {
  constructor(cmdOptions) {
    this.cmdOptions = cmdOptions;

    this.baseDir = cmdOptions['baseDir'] || '/tmp/taskcluster-builder-build';
    this.logsDir = cmdOptions['logsDir'] || path.join(this.baseDir, 'logs');
  }

  // credentials for the tasks
  async credentials() {} // implemented in subclasses

  // taskgraph targets
  async target() {} // implemented in subclasses

  // Return {'release-version', 'release-revision'}
  async versionInfo() {} // implemented in subclasses

  async run() {
    if (!this.cmdOptions.cache) {
      await rimraf(this.baseDir);
    }
    await mkdirp(this.baseDir);

    await rimraf(this.logsDir);
    await mkdirp(this.logsDir);

    // get the subclass-specific data
    const credentials = await this.credentials();
    const target = this.target();
    const versionInfo = await this.versionInfo();

    const tasks = [];
    await generateTasks({
      tasks,
      baseDir: this.baseDir,
      logsDir: this.logsDir,
      cmdOptions: this.cmdOptions,
      credentials,
    });

    const taskgraph = new TaskGraph(tasks, {
      locks: {
        // limit ourselves to one docker process per CPU
        docker: new Lock(os.cpus().length),
        // and let's be sane about how many git clones we do..
        git: new Lock(8),
      },
      target,
      renderer: process.stdout.isTTY ?
        new ConsoleRenderer({ elideCompleted: true }) :
        new LogRenderer(),
    });
    if (this.cmdOptions.dryRun) {
      console.log('Dry run successful.');
      return;
    }
    const context = await taskgraph.run(versionInfo);

    if (!this.cmdOptions.push) {
      console.log('  NOTE: not pushed (use --push)');
    }

    // print messges from any of the targets
    for (let t of target) {
      if (context[t]) {
        console.log(context[t]);
      }
    }
  }
}

class Build extends Base {
  async credentials() {
    return {
      // it's OK for these to be undefined when running locally; docker will
      // just use the user's credentials
      dockerUsername: process.env.DOCKER_USERNAME,
      dockerPassword: process.env.DOCKER_PASSWORD,
    };
  }

  async versionInfo() {
    // The docker build clones from the current working copy, rather than anything upstream;
    // this avoids the need to land-and-push changes.  This is a git clone
    // operation instead of a raw filesystem copy so that any non-checked-in
    // files are not accidentally built into docker images.  But it does mean that
    // changes need to be checked in.
    if (!this.cmdOptions.ignoreUncommittedFiles) {
      if (await gitIsDirty({ dir: REPO_ROOT })) {
        throw new Error([
          'The current git working copy is not clean. Any non-checked-in files will',
          'not be reflected in the built image, so this is treatd as an error by default.',
          'Either check in the dirty files, or run with --ignore-uncommitted-files to',
          'override this error.  Never check in files containing secrets!',
        ].join(' '));
      }
    }

    const { gitDescription, revision } = await gitDescribe({
      dir: REPO_ROOT,
    });

    return {
      'release-version': gitDescription.slice(1),
      'release-revision': revision,
    };
  }

  target() {
    const all_targets = [
      'target-monoimage',
      'target-monoimage-devel',
      'target-livelog',
      'target-client-shell',
      'target-generic-worker',
      'target-generic-worker-image',
      'target-worker-runner',
      'target-taskcluster-proxy',
      'target-websocktunnel',
    ];
    if (this.cmdOptions.target === 'all') {
      return all_targets;
    } else if (this.cmdOptions.target) {
      const target = `target-${this.cmdOptions.target}`;
      if (!all_targets.includes(target)) {
        throw new Error(`unknown --target; use one of ${all_targets.map(t => t.replace(/^target-/, '')).join(', ')}`);
      }
      return [target];
    }
    return ['target-monoimage'];
  }
}

class Publish extends Base {
  constructor(cmdOptions) {
    super({
      ...cmdOptions,
      // always build from scratch
      cache: false,
      // to be safe, set push=false for staging runs
      push: cmdOptions.staging ? false : true,
      // always push to the "official" Taskcluster repo on publish
      dockerRepo: 'taskcluster/taskcluster',
      dockerRepoGenericWorker: 'taskcluster/generic-worker',
    });
  }

  async credentials() {
    // try loading the secret into process.env
    if (process.env.TASKCLUSTER_PROXY_URL) {
      const secretName = `project/taskcluster/${this.cmdOptions.staging ? 'staging-' : ''}release`;
      console.log(`loading secrets from taskcluster secret ${secretName} via taskcluster-proxy`);
      const secrets = new taskcluster.Secrets({ rootUrl: process.env.TASKCLUSTER_PROXY_URL });
      const { secret } = await secrets.get(secretName);

      for (let [name, value] of Object.entries(secret)) {
        console.log(`..found value for ${name}`);
        process.env[name] = value;
      }
    }

    const expectedVars = [];
    expectedVars.push('GH_TOKEN');
    if (!this.cmdOptions.staging) {
      expectedVars.push('NPM_TOKEN');
      expectedVars.push('CRATESIO_TOKEN');
      expectedVars.push('PYPI_USERNAME');
      expectedVars.push('PYPI_PASSWORD');
      expectedVars.push('DOCKER_USERNAME');
      expectedVars.push('DOCKER_PASSWORD');
      expectedVars.push('CHOCOLATEY_API_KEY');
    }

    expectedVars.forEach(e => {
      if (!process.env[e]) {
        //throw new Error(`$${e} is required`);
      }
    });

    return {
      ghToken: process.env.GH_TOKEN,
      npmToken: process.env.NPM_TOKEN,
      cratesioToken: process.env.CRATESIO_TOKEN,
      pypiUsername: process.env.PYPI_USERNAME,
      pypiPassword: process.env.PYPI_PASSWORD,
      dockerUsername: process.env.DOCKER_USERNAME,
      dockerPassword: process.env.DOCKER_PASSWORD,
      chocolateyApiKey: process.env.CHOCOLATEY_API_KEY,
    };
  }

  async versionInfo() {
    if (this.cmdOptions.staging) {
      // for staging releases, we get the version from the staging-release/*
      // branch name, and use a fake revision
      const match = /staging-release\/v(\d+\.\d+\.\d+)$/.exec(this.cmdOptions.staging);
      if (!match) {
        throw new Error(`Staging releases must have branches named 'staging-release/vX.Y.Z'; got ${this.cmdOptions.staging}`);
      }
      const version = match[1];

      return {
        'release-version': version,
        'release-revision': '9999999999999999999999999999999999999999',
      };
    } else {
      const { gitDescription, revision } = await gitDescribe({
        dir: REPO_ROOT,
      });

      if (!gitDescription.match(/^v\d+\.\d+\.\d+$/)) {
        throw new Error(`Can only publish releases from git revisions with tags of the form vX.Y.Z, not ${gitDescription}`);
      }

      return {
        'release-version': gitDescription.slice(1),
        'release-revision': revision,
      };
    }
  }

  target() {
    return ['target-publish'];
  }
}

export const build = async (options) => {
  const build = new Build(options);
  await build.run();
};

export const publish = async (options) => {
  const publish = new Publish(options);
  await publish.run();
};
