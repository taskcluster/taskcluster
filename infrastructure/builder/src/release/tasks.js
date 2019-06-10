module.exports = ({tasks, cmdOptions}) => {
  tasks.push({
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
