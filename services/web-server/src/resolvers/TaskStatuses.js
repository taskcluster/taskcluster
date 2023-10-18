import sift from '../utils/sift.js';

export default {
  TaskState: {
    UNSCHEDULED: 'unscheduled',
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    EXCEPTION: 'exception',
  },
  TaskStatus: {
    task(parent, args, { loaders }) {
      return loaders.task.load(parent.taskId);
    },
    runs(parent, args) {
      return sift(args.filter, parent.runs);
    },
  },
  Query: {
    status(parent, { taskId }, { loaders }) {
      return loaders.status.load(taskId);
    },
  },
};
