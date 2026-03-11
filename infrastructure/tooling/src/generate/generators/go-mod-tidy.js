import { promisify } from 'util';
import { execFile } from 'child_process';

export const tasks = [{
  title: 'Go Mod Tidy',
  provides: ['target-go-mod-tidy'],
  run: async (requirements, utils) => {
    await promisify(execFile)('go', ['mod', 'tidy']);
  },
}];
