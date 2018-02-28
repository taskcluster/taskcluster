import DataLoader from 'dataloader';
import TaskStatus from '../entities/TaskStatus';

export default ({ queue }) => {
  const status = new DataLoader(taskIds =>
    Promise.all(
      taskIds.map(async taskId => {
        const { status } = await queue.status(taskId);

        return new TaskStatus(taskId, status);
      })
    )
  );

  return {
    status,
  };
};
