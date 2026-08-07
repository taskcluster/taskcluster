import { buildLogViewerUrl } from './artifactNames';

describe('buildLogViewerUrl', () => {
  it('should build an encoded log viewer url', () => {
    expect(
      buildLogViewerUrl({
        taskId: 'taskId',
        runId: 0,
        name: 'public/logs/file name.log',
      })
    ).toEqual('/tasks/taskId/runs/0/logs/public/logs/file%20name.log');
  });

  it('should build a live log viewer url', () => {
    expect(
      buildLogViewerUrl({
        taskId: 'taskId',
        runId: 0,
        name: 'public/logs/live.log',
        isLiveLog: true,
      })
    ).toEqual('/tasks/taskId/runs/0/logs/live/public/logs/live.log');
  });

  it('should return null for names that can alter the route', () => {
    [
      '../../../../../shell#.log',
      '%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/shell/x.log',
      'public/../shell.log',
      'public/./shell.log',
      'public/logs/live.log?download=1',
      'public/logs/live#.log',
      '..\\..\\..\\..\\..\\shell#.log',
      'public//logs/live.log',
      '/public/logs/live.log',
      'public/logs/100%.log',
    ].forEach(name => {
      expect(
        buildLogViewerUrl({ taskId: 'taskId', runId: 0, name })
      ).toBeNull();
    });
  });
});
