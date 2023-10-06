// add a task to tasks only if it isn't already there
export const ensureTask = (tasks, task) => {
  if (!tasks.find(t => t.title === task.title)) {
    tasks.push(task);
  }
};
