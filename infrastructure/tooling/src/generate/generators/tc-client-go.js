import path from 'path';
import { REPO_ROOT, execCommand } from '../../utils/index.js';

export const tasks = [{
  title: 'Generate Taskcluster-Client-Go',
  requires: ['references-json', 'target-go-version'],
  provides: ['target-taskcluster-client-go'],
  run: async (requirements, utils) => {
    await execCommand({
      dir: path.join(REPO_ROOT, 'clients', 'client-go'),
      command: ['go', 'generate', './...'],
      utils,
    });
  },
}];
