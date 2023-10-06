import { checks } from './checks/index.js';
import { TaskGraph } from 'console-taskgraph';

const main = async (options) => {
  const taskgraph = new TaskGraph(checks, {});
  await taskgraph.run();
};

export default { main };
