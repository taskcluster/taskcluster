const generators = require('./generators');
const {TaskGraph} = require('console-taskgraph');

const main = async (options) => {
  const target = options.target ? [`target-${options.target}`] : undefined;
  const taskgraph = new TaskGraph(generators, {target});
  await taskgraph.run();
};

module.exports = {main};
