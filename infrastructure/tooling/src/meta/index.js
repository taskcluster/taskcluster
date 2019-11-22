const {checks} = require('./checks');
const {TaskGraph} = require('console-taskgraph');

const main = async (options) => {
  const taskgraph = new TaskGraph(checks, {});
  await taskgraph.run();
};

module.exports = {main};
