import sift from 'sift';

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
      return args.filter ? sift(args.filter, parent.runs) : parent.runs;
    },
  },
  Query: {
    status(parent, { taskId }, { loaders }) {
      return loaders.status.load(taskId);
    },
  },
};
