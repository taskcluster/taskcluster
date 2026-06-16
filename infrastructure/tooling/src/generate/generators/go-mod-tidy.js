import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

export const tasks = [{
  title: 'Go Mod Tidy',
  requires: [
    'target-taskcluster-client-go',
    'target-taskcluster-client-shell',
    'target-d2g',
    'target-generic-worker',
  ],
  provides: ['target-go-mod-tidy'],
  run: async (_requirements, _utils) => {
    await promisify(execFile)('go', ['mod', 'tidy']);
  },
}];
