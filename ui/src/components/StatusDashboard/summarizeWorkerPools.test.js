import summarizeWorkerPools from './summarizeWorkerPools';

describe('summarizeWorkerPools', () => {
  it('should return empty values', () => {
    const out = summarizeWorkerPools({});

    expect(out.length).toEqual(9);
    expect(out[0].value).toEqual('0');
    expect(out[1].value).toEqual('0');
    expect(out[2].value).toEqual('0');
    expect(out[3].value).toEqual('0');
    expect(out[4].value).toEqual('0');
    expect(out[5].value).toEqual('0');
    expect(out[0].error).toBeUndefined();
    expect(out[0].link).toEqual('/worker-manager');
  });
  it('should include errors', () => {
    const out = summarizeWorkerPools({
      error: new Error('wrong'),
    });

    expect(out.length).toEqual(9);
    expect(out[0].value).toEqual('0');
    expect(out[0].error).toEqual('wrong');
    expect(out[1].error).toEqual('wrong');
    expect(out[2].error).toEqual('wrong');
    expect(out[5].error).toEqual('wrong');
  });
  it('should return counts', () => {
    const out = summarizeWorkerPools({
      data: {
        WorkerManagerWorkerPoolSummaries: {
          edges: [
            {
              node: {
                providerId: 'prov1',
                currentCapacity: 1,
                pendingTasks: 9,
                runningCount: 1,
                requestedCount: 1,
                requestedCapacity: 1,
                runningCapacity: 1,
                stoppedCount: 3,
              },
            },
          ],
        },
      },
    });

    expect(out.length).toEqual(9);
    expect(out[0].value).toEqual('1');
    expect(out[1].value).toEqual('1');
    expect(out[2].value).toEqual('1');
    expect(out[3].value).toEqual('1');
    expect(out[3].value).toEqual('1');
    expect(out[4].value).toEqual('1');
    expect(out[5].value).toEqual('3');
    expect(out[6].value).toEqual('9');
    expect(out[7].value).toEqual('1');
    expect(out[8].value).toEqual('1');
  });
});
