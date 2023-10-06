import { loadChecks } from './checks/index.js';
import { TaskGraph } from 'console-taskgraph';

export const main = async (options) => {
  const checks = await loadChecks();
  console.log(checks);
  const taskgraph = new TaskGraph(checks, {});
  await taskgraph.run();
};
