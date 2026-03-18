import { ConsoleRenderer, LogRenderer, TaskGraph } from 'console-taskgraph';
import { getTasks } from './tasks.js';

export const main = async (_options) => {
  const taskgraph = new TaskGraph(await getTasks(), {
    renderer: process.stdout.isTTY ? new ConsoleRenderer({ elideCompleted: true }) : new LogRenderer(),
  });
  await taskgraph.run();
};
