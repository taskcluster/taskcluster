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
        data: [
          {
            workerPoolId: 'prov1/pool1',
            providerId: 'prov1',
            currentCapacity: 1,
            pendingTasks: 9,
            runningCount: 1,
            requestedCount: 1,
            requestedCapacity: 1,
            runningCapacity: 1,
            stoppedCount: 3,
          },
        ],
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
        data: [
          {
            workerPoolId: 'prov1/pool1',
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
        ],
      },
      'provisioning'
    );

    expect(out.length).toEqual(4);

    expect(widgetByTitle(out, 'Pending Tasks').value).toEqual('9');
    expect(widgetByTitle(out, 'Requested Capacity').value).toEqual('1');
    expect(widgetByTitle(out, 'Running Capacity').value).toEqual('1');
    expect(widgetByTitle(out, 'Stopping Capacity').value).toEqual('4');
  });

  it('should aggregate across pools and providers', () => {
    const out = summarizeWorkerPools({
      data: [
        {
          workerPoolId: 'prov1/a',
          providerId: 'prov1',
          currentCapacity: 2,
          pendingTasks: 5,
          runningCount: 2,
          requestedCapacity: 1,
          runningCapacity: 2,
          stoppedCount: 1,
          stoppingCapacity: 0,
        },
        {
          workerPoolId: 'prov1/b',
          providerId: 'prov1',
          currentCapacity: 0,
          pendingTasks: 0,
          runningCount: 0,
          requestedCapacity: 0,
          runningCapacity: 0,
          stoppedCount: 4,
          stoppingCapacity: 1,
        },
        {
          workerPoolId: 'prov2/c',
          providerId: 'prov2',
          currentCapacity: 1,
          pendingTasks: 1500,
          runningCount: 1,
          requestedCapacity: 3,
          runningCapacity: 1,
          stoppedCount: 0,
          stoppingCapacity: 2,
        },
      ],
    });

    expect(widgetByTitle(out, 'Providers').value).toEqual('2');
    expect(widgetByTitle(out, 'Total Pools').value).toEqual('3');
    expect(widgetByTitle(out, 'Total Pools with Workers').value).toEqual('2');
    expect(widgetByTitle(out, 'Workers Running').value).toEqual('3');
    expect(widgetByTitle(out, 'Stopped Workers').value).toEqual('5');
    expect(widgetByTitle(out, 'Pending Tasks').value).toEqual('1,505');
    expect(widgetByTitle(out, 'Requested Capacity').value).toEqual('4');
    expect(widgetByTitle(out, 'Running Capacity').value).toEqual('3');
    expect(widgetByTitle(out, 'Stopping Capacity').value).toEqual('3');
  });

  it('should treat a pool without stats as contributing zero', () => {
    const out = summarizeWorkerPools({
      data: [
        { workerPoolId: 'prov1/new', providerId: 'prov1' },
        {
          workerPoolId: 'prov1/a',
          providerId: 'prov1',
          currentCapacity: 1,
          pendingTasks: 2,
          runningCount: 1,
          requestedCapacity: 1,
          runningCapacity: 1,
          stoppedCount: 1,
          stoppingCapacity: 1,
        },
      ],
    });

    expect(widgetByTitle(out, 'Total Pools').value).toEqual('2');
    expect(widgetByTitle(out, 'Total Pools with Workers').value).toEqual('1');
    expect(widgetByTitle(out, 'Workers Running').value).toEqual('1');
    expect(widgetByTitle(out, 'Pending Tasks').value).toEqual('2');
  });
});
