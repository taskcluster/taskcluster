const generators = require('./generators');
const {TaskGraph, ConsoleRenderer, LogRenderer} = require('console-taskgraph');

const main = async (options) => {
  const target = options.target ? [`target-${options.target}`] : undefined;
  const taskgraph = new TaskGraph(generators, {
    target,
    renderer: process.stdout.isTTY ?
      new ConsoleRenderer({elideCompleted: true}) :
      new LogRenderer(),
  });
  await taskgraph.run();
};

module.exports = {main};
