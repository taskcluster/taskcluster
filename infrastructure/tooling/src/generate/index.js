import { TaskGraph, ConsoleRenderer, LogRenderer } from 'console-taskgraph';
import { loadGenerators } from './generators/index.js';

export const main = async (options) => {
  const generators = await loadGenerators();
  console.log(generators);
  const target = options.target ? [`target-${options.target}`] : undefined;
  const taskgraph = new TaskGraph(generators, {
    target,
    renderer: process.stdout.isTTY ?
      new ConsoleRenderer({ elideCompleted: true }) :
      new LogRenderer(),
  });
  await taskgraph.run();
};
