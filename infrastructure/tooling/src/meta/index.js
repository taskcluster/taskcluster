import { TaskGraph } from 'console-taskgraph';
import { loadChecks } from './checks/index.js';

export const main = async (_options) => {
  const checks = await loadChecks();
  const taskgraph = new TaskGraph(checks, {});
  await taskgraph.run();
};
