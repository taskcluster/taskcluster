import summarizeNonWmTaskQueues from './summarizeNonWmTaskQueues';

describe('summarizeNonWmTaskQueues', () => {
  it('should sum pending and claimed tasks', () => {
    const out = summarizeNonWmTaskQueues({
      data: [
        { taskQueueId: 'a/b', pendingTasks: 3, claimedTasks: 1 },
        { taskQueueId: 'c/d', pendingTasks: 2, claimedTasks: 0 },
      ],
    });

    expect(out.map(item => [item.title, item.value])).toEqual([
      ['Pending Tasks', '5'],
      ['Claimed Tasks', '1'],
    ]);
  });
  it('should show n/a when a count is unavailable', () => {
    const out = summarizeNonWmTaskQueues({
      data: [
        { taskQueueId: 'a/b', pendingTasks: 3, claimedTasks: 1 },
        { taskQueueId: 'c/d', pendingTasks: null, claimedTasks: null },
      ],
    });

    expect(out[0].value).toEqual('n/a');
    expect(out[1].value).toEqual('n/a');
  });
  it('should show n/a and the error when discovery fails', () => {
    const out = summarizeNonWmTaskQueues({ error: new Error('wrong') });

    expect(out[0].value).toEqual('n/a');
    expect(out[0].error).toEqual('wrong');
  });
});
