const { getTasks } = require('./tasks');
const { TaskGraph, ConsoleRenderer, LogRenderer } = require('console-taskgraph');

const main = async (options) => {
  const taskgraph = new TaskGraph(await getTasks(), {
    renderer: process.stdout.isTTY ?
      new ConsoleRenderer({ elideCompleted: true }) :
      new LogRenderer(),
  });
  await taskgraph.run();
};

module.exports = { main };
