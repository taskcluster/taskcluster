import path from 'path';
import { REPO_ROOT, execCommand } from '../../utils';

export const tasks = [];

exports.tasks.push({
  title: 'Generate d2g',
  requires: ['references-json', 'target-go-version'],
  provides: ['target-d2g'],
  run: async (requirements, utils) => {
    await execCommand({
      dir: path.join(REPO_ROOT, 'tools', 'd2g'),
      command: ['go', 'generate', './...'],
      utils,
    });
  },
});
