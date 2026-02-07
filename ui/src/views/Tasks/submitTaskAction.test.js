import submitTaskAction from './submitTaskAction';
import { getClient } from '../../utils/client';

// Mock getClient to return a mock Queue instance
jest.mock('../../utils/client', () => ({
  getClient: jest.fn(),
}));
jest.mock('@taskcluster/client-web', () => ({
  Queue: jest.fn(),
}));
// Mock validateActionsJson to avoid fetch in test environment
jest.mock('../../utils/validateActionsJson', () =>
  jest.fn().mockResolvedValue(() => true)
);

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
  const mockCreateTask = jest.fn().mockResolvedValue({});

  beforeEach(() => {
    jest.clearAllMocks();
    getClient.mockReturnValue({ createTask: mockCreateTask });
  });

  it('action.kind=task: calls Queue.createTask directly (not Apollo)', async () => {
    const apolloClient = { mutate: jest.fn(), query: jest.fn() };
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
      apolloClient,
      user,
    });

    // Queue.createTask should be called directly
    expect(mockCreateTask).toHaveBeenCalledTimes(1);
    // apolloClient.mutate should NOT be called for task kind
    expect(apolloClient.mutate).not.toHaveBeenCalled();
  });

  it('action.kind=task: passes authorizedScopes from taskGroup.scopes', async () => {
    const apolloClient = { mutate: jest.fn(), query: jest.fn() };
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
      apolloClient,
      user,
    });

    expect(getClient).toHaveBeenCalledWith(
      expect.objectContaining({
        user,
        authorizedScopes: scopes,
      })
    );
  });
});
