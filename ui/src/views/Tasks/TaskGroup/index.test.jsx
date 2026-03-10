import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import TaskGroup from './index';
import taskGroupQuery from './taskGroup.graphql';

const taskGroupId = 'aI8bvUB2SDmpHVqTUOFCWw';

const mocks = [
  {
    request: {
      query: taskGroupQuery,
      variables: {
        taskGroupId,
        taskGroupConnection: {
          limit: 20,
        },
        taskActionsFilter: {
          kind: {
            $in: ['task', 'hook'],
          },
          $or: [{ context: { $size: 0 } }, { context: { $size: 1 } }],
        },
      },
    },
    result: {
      data: {
        taskGroup: {
          pageInfo: {
            hasNextPage: false,
            hasPreviousPage: false,
            cursor: 'initial',
            previousCursor: null,
            nextCursor: null,
          },
          taskGroup: {
            taskGroupId,
            schedulerId: '-',
            expires: '2027-01-01T00:00:00.000Z',
            sealed: null,
          },
          edges: [
            {
              node: {
                taskId: 'taskAbc123',
                metadata: { name: 'Example Task' },
                taskGroupId,
                status: {
                  state: 'completed',
                  runs: [
                    {
                      runId: 0,
                      started: '2024-01-15T10:00:00.000Z',
                      resolved: '2024-01-15T10:05:00.000Z',
                    },
                  ],
                },
              },
            },
          ],
        },
        task: {
          taskQueueId: 'proj-releng/linux',
          schedulerId: '-',
          taskId: taskGroupId,
          taskGroupId,
          dependencies: [],
          requires: 'all-completed',
          routes: [],
          priority: 'normal',
          retries: 5,
          created: '2024-01-15T09:55:00.000Z',
          deadline: '2024-01-16T09:55:00.000Z',
          scopes: [],
          payload: {},
          metadata: {
            name: 'Decision Task',
            description: 'The decision task for this task group.',
            owner: 'owner@example.com',
            source: 'https://example.com',
          },
          tags: {},
          extra: {},
        },
        taskActions: {
          actions: [],
          variables: {},
          version: 1,
        },
      },
    },
  },
];

describe('TaskGroup page', () => {
  it('should render TaskGroup page', async () => {
    const location = {
      hash: '#term',
    };

    await act(async () => {
      const { asFragment } = render(
        <MemoryRouter keyLength={0}>
          <MockedProvider mocks={mocks} addTypename={false}>
            <TaskGroup
              match={{ params: { taskGroupId } }}
              location={location}
            />
          </MockedProvider>
        </MemoryRouter>
      );

      await waitFor(() => {});
      expect(asFragment()).toMatchSnapshot();
    });
  });
});
