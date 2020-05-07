module.exports = (queue, taskId) => {
  return new Promise(async accept => {
    let status;
    do {
      status = await queue.status(taskId);
    } while (status.status.state === 'running');
    accept(status.status);
  });
};
