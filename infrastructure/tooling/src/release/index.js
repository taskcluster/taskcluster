import os from 'node:os';
import { TaskGraph, Lock, ConsoleRenderer, LogRenderer } from 'console-taskgraph';
import generateReleaseTasks from './tasks.js';
import { withDetachedHead } from './detached-head.js';
import { gitDescribe, REPO_ROOT } from '../utils/index.js';

export class Release {
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

  async run() {
    const { staging } = this.cmdOptions;
    const tasks = this.generateTasks();

    const taskgraph = new TaskGraph(tasks, {
      locks: {
        // limit ourselves to one docker process per CPU
        docker: new Lock(os.cpus().length),
        // and let's be sane about how many git clones we do..
        git: new Lock(8),
      },
      target: staging ? 'target-staging-release' : 'target-release',
      renderer: process.stdout.isTTY ? new ConsoleRenderer({ elideCompleted: true }) : new LogRenderer(),
    });
    if (this.cmdOptions.dryRun) {
      console.log('Dry run successful.');
      return;
    }
    const context = await taskgraph.run();

    console.log(`Release version: ${context['release-version']}`);
    const { revision } = await gitDescribe({ dir: REPO_ROOT });
    if (staging) {
      console.log(`Staging version bump commit: ${revision}`);
      console.log(`Pushed to ${context['target-staging-release']}`);
      console.log(`Watch the release graph: https://github.com/taskcluster/staging-releases/commit/${revision}/checks`);
    } else if (!this.cmdOptions.push) {
      console.log('NOTE: image, git commit + tags, and packages not pushed due to --no-push option');
    } else {
      console.log(`Watch the release graph: https://github.com/taskcluster/taskcluster/commit/${revision}/checks`);
    }
  }
}

export const release = async options => {
  const release = new Release(options);
  await release.run();
};

export const stagingRelease = async options => {
  // Staging builds exactly what a real release builds, so commit the version
  // bump on a throwaway detached HEAD, push it, and return to the original
  // branch (which is never modified).
  const release = new Release({ ...options, staging: true });
  await withDetachedHead({ dir: REPO_ROOT, run: () => release.run() });
};
