import { Queue } from '../src';
import assert from 'assert';

describe('Queue', () => {
  const queue = new Queue();

  it('should be loaded', () => {
    assert.ok(queue);
  });

  it('should successfully ping', async () => {
    const { alive } = await queue.ping();

    assert.ok(alive);
  });
});
