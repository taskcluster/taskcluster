import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

export const tasks = [{
  title: 'Go Mod Tidy',
  provides: ['target-go-mod-tidy'],
  run: async (requirements, utils) => {
    await promisify(execFile)('go', ['mod', 'tidy']);
  },
}];
