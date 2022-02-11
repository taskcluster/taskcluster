import {
  getArtifactUrl,
  getLatestArtifactUrl,
  findArtifactFromTaskUrl,
} from './getArtifactUrl';

describe('getArtifactUrl', () => {
  let originalEnv;

  beforeAll(() => {
    originalEnv = window.env;
    window.env = {
      TASKCLUSTER_ROOT_URL: 'https://taskcluster.net',
    };
  });
  afterAll(() => {
    window.env = originalEnv;
  });

  it('should get artifact url', () => {
    window.env = {
      TASKCLUSTER_ROOT_URL: 'https://taskcluster.net',
    };
    const url = getArtifactUrl({
      user: {
        credentials: {
          accessToken: 'token',
          clientId: 'clientId',
        },
      },
      taskId: 'taskId',
      runId: 'runId',
      name: 'name',
    });

    expect(url).toContain(
      'https://taskcluster.net/api/queue/v1/task/taskId/runs/runId/artifacts/name?bewit=Y2xpZW50SWRcMTY'
    );
  });
  it('should get latest artifact url', () => {
    const url = getLatestArtifactUrl({
      user: {
        credentials: {
          accessToken: 'token',
          clientId: 'clientId',
        },
      },
      taskId: 'taskId',
      runId: 'runId',
      name: 'name',
    });

    expect(url).toContain(
      'https://taskcluster.net/api/queue/v1/task/taskId/artifacts/name?bewit=Y2xpZW50SWRcMTY'
    );
  });
  it('should find artifact from task url', () => {
    const url = findArtifactFromTaskUrl({
      user: {
        credentials: {
          accessToken: 'token',
          clientId: 'clientId',
        },
      },
      namespace: 'taskId',
      name: 'name',
    });

    expect(url).toContain(
      'https://taskcluster.net/api/index/v1/task/taskId/artifacts/name?bewit=Y2xpZW50SWRcMTY'
    );
  });
});
