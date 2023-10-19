import { getTasks } from './tasks.js';
import { TaskGraph, ConsoleRenderer, LogRenderer } from 'console-taskgraph';

export const main = async (options) => {
  const taskgraph = new TaskGraph(await getTasks(), {
    renderer: process.stdout.isTTY ?
      new ConsoleRenderer({ elideCompleted: true }) :
      new LogRenderer(),
  });
  await taskgraph.run();
};
