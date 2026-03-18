import path from 'node:path';
import { execCommand, REPO_ROOT } from '../../utils/index.js';

export const tasks = [
  {
    title: 'Generate d2g',
    requires: ['references-json', 'target-go-version'],
    provides: ['target-d2g'],
    run: async (_requirements, utils) => {
      await execCommand({
        dir: path.join(REPO_ROOT, 'tools', 'd2g'),
        command: ['go', 'generate', './...'],
        utils,
      });
    },
  },
];
