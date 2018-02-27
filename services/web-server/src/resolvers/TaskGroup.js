export default {
  Query: {
    taskGroup(parent, { taskGroupId, connection }, { loaders }) {
      return loaders.taskGroup.load({ taskGroupId, connection });
    },
  },
};
