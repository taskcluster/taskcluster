const {
  ensureTask,
} = require('../utils');

module.exports = ({tasks, version, cmdOptions}) => {
  ensureTask(tasks, {
    title: 'Pre-build Release-y Stuff',
    requires: [],
    provides: [
      'build-can-start',
    ],
    run: async (requirements, utils) => {
      await new Promise(resolve => setTimeout(resolve, 3000));
      return true;
    },
  });
};
