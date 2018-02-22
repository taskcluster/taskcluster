import queue from './queue';

export default clients => ({
  ...queue(clients.queue),
});
