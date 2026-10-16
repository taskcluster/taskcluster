import path from 'node:path';
import os from 'node:os';
import { rimraf } from 'rimraf';
import mkdirp from 'mkdirp';
import { TaskGraph, Lock, ConsoleRenderer, LogRenderer } from 'console-taskgraph';
import { generateTasks } from './tasks/index.js';
import { gitIsDirty, gitDescribe, REPO_ROOT } from '../utils/index.js';

class Build {
  constructor(cmdOptions) {
    this.cmdOptions = cmdOptions;

    this.baseDir = cmdOptions.baseDir || '/tmp/taskcluster-builder-build';
    this.logsDir = cmdOptions.logsDir || path.join(this.baseDir, 'logs');
  }

  async run() {
    if (!this.cmdOptions.cache) {
      await rimraf(this.baseDir);
    }
    await mkdirp(this.baseDir);

    await rimraf(this.logsDir);
    await mkdirp(this.logsDir);

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
      renderer: process.stdout.isTTY ? new ConsoleRenderer({ elideCompleted: true }) : new LogRenderer(),
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
    for (const t of target) {
      if (context[t]) {
        console.log(context[t]);
      }
    }
  }

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
        throw new Error(
          [
            'The current git working copy is not clean. Any non-checked-in files will',
            'not be reflected in the built image, so this is treatd as an error by default.',
            'Either check in the dirty files, or run with --ignore-uncommitted-files to',
            'override this error.  Never check in files containing secrets!',
          ].join(' ')
        );
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

export const build = async options => {
  const build = new Build(options);
  await build.run();
};
