import { vi, describe, it, expect, beforeEach } from 'vitest';
import submitTaskAction from './submitTaskAction';
import { getClient } from '../../utils/client';
import { Auth, Hooks, Queue } from '@taskcluster/client-web';

// Mock getClient to return a mock Queue instance
vi.mock('../../utils/client', () => ({
  getClient: vi.fn(),
}));
vi.mock('@taskcluster/client-web', () => ({
  Auth: vi.fn(),
  Hooks: vi.fn(),
  Queue: vi.fn(),
}));
// Mock validateActionsJson to avoid fetch in test environment
vi.mock('../../utils/validateActionsJson', () => ({
  default: vi.fn().mockResolvedValue(() => true),
}));

const taskDef = JSON.stringify({
  taskQueueId: 'test/test',
  created: '2024-01-01T00:00:00.000Z',
  deadline: '2024-01-02T00:00:00.000Z',
  expires: '2024-12-31T00:00:00.000Z',
  payload: {},
  metadata: {
    name: 'test',
    description: 'test',
    owner: 'test@test.com',
    source: 'http://test',
  },
});

describe('submitTaskAction', () => {
  const user = {
    credentials: { clientId: 'test', accessToken: 'secret' },
  };
  const mockCreateTask = vi.fn().mockResolvedValue({});
  const mockExpandScopes = vi.fn();
  const mockTriggerHook = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    getClient.mockImplementation(({ Class }) => {
      switch (Class) {
        case Queue:
          return { createTask: mockCreateTask };
        case Auth:
          return { expandScopes: mockExpandScopes };
        case Hooks:
          return { triggerHook: mockTriggerHook };
        default:
          throw new Error('unexpected client class');
      }
    });
  });

  it('action.kind=task: calls Queue.createTask directly', async () => {
    const task = {
      taskId: 'abc123',
      taskGroupId: 'abc123',
      scopes: ['queue:create-task:*'],
      taskActions: {
        variables: {},
        actions: [
          {
            kind: 'task',
            name: 'test-action',
            title: 'Test Action',
            context: [],
            schema: {},
            task: taskDef,
            description: 'Test action',
          },
        ],
        version: 1,
      },
    };
    const action = task.taskActions.actions[0];

    await submitTaskAction({
      task,
      taskActions: task.taskActions,
      form: '{}',
      action,
      user,
    });

    // Queue.createTask should be called directly
    expect(mockCreateTask).toHaveBeenCalledTimes(1);
    // no hook is involved for task kind
    expect(mockExpandScopes).not.toHaveBeenCalled();
    expect(mockTriggerHook).not.toHaveBeenCalled();
  });

  it('action.kind=task: passes authorizedScopes from taskGroup.scopes', async () => {
    const scopes = ['queue:create-task:proj-test/test-worker'];
    const task = {
      taskId: 'abc123',
      taskGroupId: 'abc123',
      scopes,
      taskActions: {
        variables: {},
        actions: [],
        version: 1,
      },
    };
    const action = {
      kind: 'task',
      name: 'retrigger',
      title: 'Retrigger',
      context: [],
      schema: {},
      task: taskDef,
      description: 'Retrigger task',
    };

    await submitTaskAction({
      task,
      taskActions: {
        variables: {},
        actions: [action],
        version: 1,
      },
      form: '{}',
      action,
      user,
    });

    expect(getClient).toHaveBeenCalledWith(
      expect.objectContaining({
        user,
        authorizedScopes: scopes,
      })
    );
  });

  const hookAction = {
    kind: 'hook',
    name: 'release',
    title: 'Release',
    description: 'Trigger a release hook',
    context: [],
    schema: {},
    hookGroupId: 'project-releng',
    hookId: 'release',
    hookPayload: { taskId: { $eval: 'taskId' } },
  };
  const hookTask = {
    taskId: 'abc123',
    taskGroupId: 'abc123',
    scopes: ['assume:repo:hg.mozilla.org/try:action:generic'],
  };

  it('action.kind=hook: expands the decision task scopes and triggers the hook over REST', async () => {
    mockExpandScopes.mockResolvedValue({
      scopes: ['in-tree:hook-action:project-releng/release'],
    });
    mockTriggerHook.mockResolvedValue({ status: { taskId: 'hook123' } });

    const taskId = await submitTaskAction({
      task: hookTask,
      taskActions: { variables: {}, actions: [hookAction], version: 1 },
      form: '{}',
      action: hookAction,
      user,
    });

    expect(getClient).toHaveBeenCalledWith({ Class: Auth, user });
    expect(mockExpandScopes).toHaveBeenCalledWith({
      scopes: hookTask.scopes,
    });
    expect(getClient).toHaveBeenCalledWith({ Class: Hooks, user });
    expect(mockTriggerHook).toHaveBeenCalledWith('project-releng', 'release', {
      taskId: 'abc123',
    });
    expect(taskId).toBe('hook123');
    expect(mockCreateTask).not.toHaveBeenCalled();
  });

  it('action.kind=hook: refuses when the expanded scopes do not cover the hook', async () => {
    mockExpandScopes.mockResolvedValue({
      scopes: ['in-tree:hook-action:project-releng/other'],
    });

    await expect(
      submitTaskAction({
        task: hookTask,
        taskActions: { variables: {}, actions: [hookAction], version: 1 },
        form: '{}',
        action: hookAction,
        user,
      })
    ).rejects.toThrow(
      "decision task's scopes do not satisfy in-tree:hook-action:project-releng/release"
    );
    expect(mockTriggerHook).not.toHaveBeenCalled();
  });
});
