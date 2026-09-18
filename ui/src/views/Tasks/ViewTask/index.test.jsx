import React from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TaskclusterClientContext } from '../../../utils/TaskclusterClient';
import { subscribeToNamedEvents } from '../../../utils/pulseListener';
import db from '../../../utils/db';
import {
  ARTIFACTS_PAGE_SIZE,
  DEPENDENTS_PAGE_SIZE,
} from '../../../utils/constants';
import ViewTask from './index';

vi.mock('../../../utils/pulseListener', () => ({
  subscribeToNamedEvents: vi.fn(),
}));

// jsdom has no IndexedDB, and the page records view history through Dexie
vi.mock('../../../utils/db', () => ({
  default: {
    taskIdsHistory: {
      put: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock('../../../utils/getArtifactUrl', () => ({
  getLatestArtifactUrl: vi.fn(
    () => 'https://tc.example.com/api/queue/v1/actions.json'
  ),
}));

const taskId = 'bI8bvUB2SDmpHVqTUOFCWw';
const taskGroupId = 'aI8bvUB2SDmpHVqTUOFCWw';
const definition = {
  taskGroupId,
  taskQueueId: 'proj/worker',
  schedulerId: 'test-scheduler',
  projectId: 'none',
  dependencies: [],
  requires: 'all-completed',
  routes: [],
  priority: 'very-high',
  retries: 5,
  created: '2026-08-30T00:00:00.000Z',
  deadline: '2026-08-30T03:00:00.000Z',
  expires: '2027-08-30T03:00:00.000Z',
  scopes: [],
  payload: { cache: { 'level-1-checkouts': '/builds/checkouts' } },
  metadata: {
    name: 'a task',
    description: 'A task',
    owner: 'user@example.com',
    source: 'https://example.com',
  },
  tags: {},
  extra: {},
};
const status = {
  taskId,
  taskGroupId,
  state: 'running',
  retriesLeft: 5,
  runs: [
    {
      runId: 0,
      state: 'exception',
      reasonCreated: 'scheduled',
      reasonResolved: 'worker-shutdown',
      scheduled: '2026-08-30T00:01:00.000Z',
      resolved: '2026-08-30T00:02:00.000Z',
    },
    {
      runId: 1,
      state: 'running',
      reasonCreated: 'retry',
      scheduled: '2026-08-30T00:02:00.000Z',
      started: '2026-08-30T00:03:00.000Z',
      workerGroup: 'wg',
      workerId: 'w1',
      takenUntil: '2026-08-30T00:23:00.000Z',
    },
  ],
};
const dependents = {
  taskId,
  tasks: [
    {
      task: { taskGroupId, metadata: { name: 'a dependent task' } },
      status: {
        taskId: 'cI8bvUB2SDmpHVqTUOFCWw',
        taskGroupId,
        state: 'unscheduled',
        runs: [],
      },
    },
  ],
};
const actionsJson = {
  version: 1,
  variables: {},
  actions: [
    {
      kind: 'task',
      name: 'retrigger',
      title: 'Retrigger',
      description: 'Run again',
      context: [{}],
      task: {},
    },
    {
      kind: 'hook',
      name: 'release',
      title: 'Release',
      description: 'Group-level action',
      context: [],
      hookGroupId: 'project-releng',
      hookId: 'release',
      hookPayload: {},
    },
  ],
};
const renderPage = async ({ queue, runId } = {}) => {
  let asFragment;

  await act(async () => {
    ({ asFragment } = render(
      <MemoryRouter keyLength={0}>
        <TaskclusterClientContext.Provider value={() => queue}>
          <ViewTask
            match={{ params: { taskId, runId } }}
            location={{ hash: '' }}
          />
        </TaskclusterClientContext.Provider>
      </MemoryRouter>
    ));
  });
  // flush the resource fetches, including those keyed on the loaded task
  await act(async () => {});
  await act(async () => {});
  await act(async () => {});

  return asFragment;
};

describe('ViewTask page', () => {
  let queue;

  beforeEach(() => {
    queue = {
      task: vi.fn().mockResolvedValue(definition),
      status: vi.fn().mockResolvedValue({ status }),
      listArtifacts: vi.fn().mockResolvedValue({
        artifacts: [
          {
            name: 'public/logs/live.log',
            contentType: 'text/plain',
            contentLength: 10,
          },
        ],
      }),
      listDependentTasks: vi.fn().mockResolvedValue(dependents),
    };
    subscribeToNamedEvents.mockReturnValue(vi.fn());
    // actions.json fetch: pretend the artifact does not exist
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
  });

  it('should render ViewTask page', async () => {
    const asFragment = await renderPage({ queue });

    // Dashboard renders null under jsdom (withWidth needs matchMedia), so
    // assert on the data layer: the task, its status, the latest run's
    // artifacts and its dependents were fetched over REST, and live updates
    // were subscribed over the events WebSocket.
    expect(queue.task).toHaveBeenCalledWith(taskId);
    expect(queue.status).toHaveBeenCalledWith(taskId);
    expect(queue.listArtifacts).toHaveBeenCalledWith(taskId, 1, {
      limit: ARTIFACTS_PAGE_SIZE,
    });
    expect(queue.listDependentTasks).toHaveBeenCalledWith(taskId, {
      limit: DEPENDENTS_PAGE_SIZE,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://tc.example.com/api/queue/v1/actions.json'
    );
    // no actions.json, so no decision task lookup either
    expect(queue.task).toHaveBeenCalledTimes(1);
    expect(subscribeToNamedEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'queue',
        subscriptions: expect.arrayContaining(['taskCompleted']),
        routingKey: { taskId },
      }),
      expect.anything()
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it('lists the artifacts of the run in the URL', async () => {
    await renderPage({ queue, runId: '0' });

    expect(queue.listArtifacts).toHaveBeenCalledWith(taskId, 0, {
      limit: ARTIFACTS_PAGE_SIZE,
    });
  });

  it('records the viewed task', async () => {
    await renderPage({ queue });

    expect(db.taskIdsHistory.put).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId,
        name: 'a task',
        taskQueueId: 'proj/worker',
        state: 'running',
      })
    );
  });

  it('loads the decision task when the task has in-tree actions', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(actionsJson),
    });

    await renderPage({ queue });

    expect(queue.task).toHaveBeenCalledWith(taskId);
    expect(queue.task).toHaveBeenCalledWith(taskGroupId);
  });

  it('still records the task when a secondary listing fails', async () => {
    queue.listArtifacts.mockRejectedValue(new Error('no scope'));

    await renderPage({ queue });

    expect(db.taskIdsHistory.put).toHaveBeenCalledWith(
      expect.objectContaining({ taskId })
    );
  });
});
