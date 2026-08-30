import React from 'react';
import { render, act } from '@testing-library/react';
import { ApolloProvider } from '@apollo/client';
import { MemoryRouter } from 'react-router-dom';
import setupClient from '../../../utils/mockApolloClient';
import { getClient } from '../../../utils/client';
import { subscribeToNamedEvents } from '../../../utils/pulseListener';
import TaskGroup from './index';

vi.mock('../../../utils/client', () => ({
  getClient: vi.fn(),
}));

vi.mock('../../../utils/pulseListener', () => ({
  subscribeToNamedEvents: vi.fn(),
}));

// jsdom has no IndexedDB, and the page reads notification preferences (and
// records view history) through Dexie before loading anything
vi.mock('../../../utils/db', () => ({
  default: {
    userPreferences: {
      get: vi.fn().mockResolvedValue(false),
      put: vi.fn().mockResolvedValue(undefined),
    },
    taskGroupIdsHistory: {
      put: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock('../../../utils/getArtifactUrl', () => ({
  getLatestArtifactUrl: vi.fn(
    () => 'https://tc.example.com/api/queue/v1/actions.json'
  ),
}));

const taskGroupId = 'aI8bvUB2SDmpHVqTUOFCWw';
const decisionTaskDefinition = {
  taskGroupId,
  taskQueueId: 'proj/decision',
  schedulerId: 'test-scheduler',
  scopes: [],
  created: '2026-08-30T00:00:00.000Z',
  metadata: {
    name: 'Decision Task',
    description: 'A decision task',
    owner: 'user@example.com',
    source: 'https://example.com',
  },
};
const listing = {
  taskGroupId,
  tasks: [
    {
      task: {
        taskGroupId,
        metadata: { name: 'a completed task' },
      },
      status: {
        taskId: 'bI8bvUB2SDmpHVqTUOFCWw',
        taskGroupId,
        state: 'completed',
        runs: [
          {
            runId: 0,
            started: '2026-08-30T00:01:00.000Z',
            resolved: '2026-08-30T00:02:00.000Z',
          },
        ],
      },
    },
  ],
};

describe('TaskGroup page', () => {
  beforeEach(() => {
    getClient.mockReturnValue({
      getTaskGroup: vi.fn().mockResolvedValue({
        taskGroupId,
        schedulerId: 'test-scheduler',
        expires: '2027-08-30T00:00:00.000Z',
        sealed: null,
      }),
      task: vi.fn().mockResolvedValue(decisionTaskDefinition),
      listTaskGroup: vi.fn().mockResolvedValue(listing),
    });
    subscribeToNamedEvents.mockReturnValue(vi.fn());
    // actions.json fetch: pretend the artifact does not exist
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
  });

  it('should render TaskGroup page', async () => {
    // an Apollo client is still required by @withApollo, which the page keeps
    // for submitTaskAction's hook-kind actions
    const createClient = setupClient({}, 'type Query { unused: String }');
    const location = {
      hash: '#term',
    };
    let asFragment;

    await act(async () => {
      ({ asFragment } = render(
        <MemoryRouter keyLength={0}>
          <ApolloProvider client={createClient()}>
            <TaskGroup
              match={{ params: { taskGroupId } }}
              location={location}
            />
          </ApolloProvider>
        </MemoryRouter>
      ));
    });

    // flush the load() promise chain and the batched table-update timer
    // (vitest.setup.js turns on fake timers globally)
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    await act(async () => {});

    // Dashboard renders null under jsdom (withWidth needs matchMedia), so
    // assert on the data layer: the group, its decision task, and its tasks
    // were fetched over REST, and live updates were subscribed over the
    // events WebSocket.
    const queue = getClient.mock.results[0].value;

    expect(queue.getTaskGroup).toHaveBeenCalledWith(taskGroupId);
    expect(queue.task).toHaveBeenCalledWith(taskGroupId);
    expect(queue.listTaskGroup).toHaveBeenCalledWith(taskGroupId, {
      limit: 20,
    });
    expect(subscribeToNamedEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptions: expect.arrayContaining(['taskCompleted']),
        routingKey: { taskGroupId },
      }),
      expect.anything()
    );
    expect(asFragment()).toMatchSnapshot();
  });
});
