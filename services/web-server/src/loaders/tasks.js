import DataLoader from 'dataloader';
import Task from '../entities/Task';

export default ({ queue }) => {
  const task = new DataLoader(taskIds =>
    Promise.all(
      taskIds.map(async taskId => {
        const task = await queue.task(taskId);

        return new Task(taskId, null, task);
      })
    )
  );

  return {
    task,
  };
};
