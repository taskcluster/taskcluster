const DataLoader = require('dataloader');
const TaskStatus = require('../entities/TaskStatus');

module.exports = ({ queue }) => {
  const status = new DataLoader(taskIds =>
    Promise.all(
      taskIds.map(async taskId => {
        const { status } = await queue.status(taskId);

        return new TaskStatus(taskId, status);
      }),
    ),
  );

  return {
    status,
  };
};
