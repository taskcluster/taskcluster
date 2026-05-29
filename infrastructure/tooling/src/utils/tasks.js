// add a task to tasks, throwing if a task with the same title already exists
export const ensureTask = (tasks, task) => {
  if (tasks.find(t => t.title === task.title)) {
    throw new Error(`Duplicate task title: '${task.title}'`);
  }
  tasks.push(task);
};
