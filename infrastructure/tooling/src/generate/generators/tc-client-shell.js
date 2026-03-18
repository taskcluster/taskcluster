import path from 'node:path';
import { execCommand, REPO_ROOT } from '../../utils/index.js';

export const tasks = [
  {
    title: 'Generate Taskcluster-Client-Shell',
    requires: ['references-json', 'target-go-version'],
    provides: ['target-taskcluster-client-shell'],
    run: async (_requirements, utils) => {
      await execCommand({
        dir: path.join(REPO_ROOT, 'clients', 'client-shell'),
        command: ['go', 'generate', './...'],
        utils,
      });
    },
  },
];
