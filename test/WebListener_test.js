import { WebListener, QueueEvents } from '../src';

describe('WebListener', function() {
  this.timeout(30000);

  it('should connect -> close', () => {
    return new Promise(resolve => resolve(new WebListener()))
      .then(listener => listener.connect().then(() => listener))
      .then(listener => listener.close());
  });

  it('should connect -> bind -> close', () => {
    return new Promise(resolve => resolve(new WebListener()))
      .then(listener => listener.connect().then(() => listener))
      .then(listener => {
        const queueEvents = new QueueEvents();

        return listener
          .bind(queueEvents.taskDefined({
            taskId: 'uTOskJejRr-DFMqUB_bpLw' // this doesn't exist
          }))
          .then(() => listener);
      })
      .then(listener => listener.close());
  });
});
