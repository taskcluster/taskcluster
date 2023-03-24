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

  const widgetByTitle = (widgets, title) =>
    widgets.find(widget => widget.title === title);

  it('should return counts for stats', () => {
    const out = summarizeWorkerPools(
      {
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
      },
      'stats'
    );

    expect(out.length).toEqual(5);

    expect(widgetByTitle(out, 'Providers').value).toEqual('1');
    expect(widgetByTitle(out, 'Total Pools').value).toEqual('1');
    expect(widgetByTitle(out, 'Total Pools with Workers').value).toEqual('1');
    expect(widgetByTitle(out, 'Workers Running').value).toEqual('1');
    expect(widgetByTitle(out, 'Stopped Workers').value).toEqual('3');
  });

  it('should return counts for provisioning', () => {
    const out = summarizeWorkerPools(
      {
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
                  stoppingCapacity: 4,
                },
              },
            ],
          },
        },
      },
      'provisioning'
    );

    expect(out.length).toEqual(4);

    expect(widgetByTitle(out, 'Pending Tasks').value).toEqual('9');
    expect(widgetByTitle(out, 'Requested Capacity').value).toEqual('1');
    expect(widgetByTitle(out, 'Running Capacity').value).toEqual('1');
    expect(widgetByTitle(out, 'Stopping Capacity').value).toEqual('4');
  });
});
