import DataLoader from 'dataloader';
import TaskStatus from '../entities/TaskStatus.js';

export default ({ queue }, _isAuthed, _rootUrl, _monitor, _strategies, _req, _cfg, _requestId) => {
  const status = new DataLoader(taskIds =>
    Promise.all(
      taskIds.map(async taskId => {
        try {
          const { status } = await queue.status(taskId);

          return new TaskStatus(taskId, status);
        } catch (err) {
          return err;
        }
      }),
    ),
  );

  return {
    status,
  };
};
