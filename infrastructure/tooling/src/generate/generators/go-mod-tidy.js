import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const tasks = [
  {
    title: 'Go Mod Tidy',
    provides: ['target-go-mod-tidy'],
    run: async (_requirements, _utils) => {
      await promisify(execFile)('go', ['mod', 'tidy']);
    },
  },
];
