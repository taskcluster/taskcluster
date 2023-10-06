import { getTasks } from './tasks';
import { TaskGraph, ConsoleRenderer, LogRenderer } from 'console-taskgraph';

const main = async (options) => {
  const taskgraph = new TaskGraph(await getTasks(), {
    renderer: process.stdout.isTTY ?
      new ConsoleRenderer({ elideCompleted: true }) :
      new LogRenderer(),
  });
  await taskgraph.run();
};

export default { main };
