import path from 'path';
import { REPO_ROOT, execCommand } from '../../utils';

export const tasks = [{
  title: 'Generate Taskcluster-Client-Shell',
  requires: ['references-json', 'target-go-version'],
  provides: ['target-taskcluster-client-shell'],
  run: async (requirements, utils) => {
    await execCommand({
      dir: path.join(REPO_ROOT, 'clients', 'client-shell'),
      command: ['go', 'generate', './...'],
      utils,
    });
  },
}];
