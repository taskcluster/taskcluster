import { promisify } from 'util';
import { execFile } from 'child_process';

export const tasks = [{
  title: 'Go Mod Tidy',
  requires: [
    'target-taskcluster-client-go',
    'target-taskcluster-client-shell',
    'target-d2g',
    'target-generic-worker',
  ],
  provides: ['target-go-mod-tidy'],
  run: async (requirements, utils) => {
    await promisify(execFile)('go', ['mod', 'tidy']);
  },
}];
