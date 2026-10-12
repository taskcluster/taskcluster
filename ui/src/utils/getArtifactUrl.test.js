import {
  getArtifactUrl,
  getLatestArtifactUrl,
  findArtifactFromTaskUrl,
  resolveLatestArtifactUrl,
} from './getArtifactUrl';
import { getAnonymousScopes } from './anonymousScopes';

vi.mock('./anonymousScopes', async importOriginal => ({
  ...(await importOriginal()),
  getAnonymousScopes: vi.fn(),
}));

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
  it('should get artifact url with no credentials', () => {
    const url = getArtifactUrl({
      user: {
        profile: 'yes',
      },
      taskId: 'taskId',
      runId: 'runId',
      name: 'name',
    });

    expect(url).toEqual(
      'https://taskcluster.net/api/queue/v1/task/taskId/runs/runId/artifacts/name'
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
  it('should not sign artifacts readable with anonymous scopes', () => {
    const args = {
      user: {
        credentials: {
          accessToken: 'token',
          clientId: 'clientId',
        },
      },
      anonymousScopes: ['queue:get-artifact:public/*'],
      taskId: 'taskId',
      runId: 'runId',
    };

    expect(getArtifactUrl({ ...args, name: 'public/build.zip' })).toEqual(
      'https://taskcluster.net/api/queue/v1/task/taskId/runs/runId/artifacts/public%2Fbuild.zip'
    );
    expect(getArtifactUrl({ ...args, name: 'private/build.zip' })).toContain(
      '?bewit='
    );
  });
  it('should sign all artifacts when anonymous scopes are unknown', () => {
    const url = getArtifactUrl({
      user: {
        credentials: {
          accessToken: 'token',
          clientId: 'clientId',
        },
      },
      anonymousScopes: null,
      taskId: 'taskId',
      runId: 'runId',
      name: 'public/build.zip',
    });

    expect(url).toContain('?bewit=');
  });
  it('should resolve public latest artifact urls without credentials', async () => {
    const getCredentials = vi.fn();

    getAnonymousScopes.mockResolvedValue(['queue:get-artifact:public/*']);

    const url = await resolveLatestArtifactUrl({
      getCredentials,
      taskId: 'taskId',
      name: 'public/actions.json',
    });

    expect(url).toEqual(
      'https://taskcluster.net/api/queue/v1/task/taskId/artifacts/public%2Factions.json'
    );
    expect(getCredentials).not.toHaveBeenCalled();
  });
  it('should sign non-public latest artifact urls with fresh credentials', async () => {
    getAnonymousScopes.mockResolvedValue([]);

    const url = await resolveLatestArtifactUrl({
      getCredentials: vi
        .fn()
        .mockResolvedValue({ accessToken: 'token', clientId: 'clientId' }),
      taskId: 'taskId',
      name: 'public/actions.json',
    });

    expect(url).toContain('?bewit=');
  });
});
