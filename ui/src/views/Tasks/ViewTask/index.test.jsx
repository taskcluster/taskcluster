import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import ViewTask from './index';
import taskQuery from './task.graphql';

const taskId = 'taskId123456789';
const mocks = [
  {
    request: {
      query: taskQuery,
      variables: {
        taskId,
        artifactsConnection: {
          limit: 1000,
        },
        dependentsConnection: {
          limit: 25,
        },
        taskActionsFilter: {
          kind: {
            $in: ['task', 'hook'],
          },
          context: {
            $not: {
              $size: 0,
            },
          },
        },
      },
    },
    result: {
      data: {
        task: {
          taskId,
          taskGroupId: 'groupId123456789',
          retries: 5,
          created: '2024-01-15T09:55:00.000Z',
          deadline: '2024-01-16T09:55:00.000Z',
          expires: '2025-01-15T09:55:00.000Z',
          priority: 'normal',
          taskQueueId: 'proj-releng/linux',
          schedulerId: '-',
          projectId: 'proj-releng',
          tags: { kind: 'test' },
          requires: 'all-completed',
          scopes: [],
          routes: [],
          payload: {},
          extra: {},
          dependencies: [],
          metadata: {
            name: 'Example Task',
            description: 'An example task for testing.',
            owner: 'owner@example.com',
            source: 'https://example.com',
          },
          status: {
            state: 'completed',
            retriesLeft: 5,
            runs: [
              {
                taskId,
                runId: 0,
                state: 'completed',
                reasonCreated: 'scheduled',
                reasonResolved: 'completed',
                scheduled: '2024-01-15T10:00:00.000Z',
                started: '2024-01-15T10:01:00.000Z',
                resolved: '2024-01-15T10:05:00.000Z',
                workerGroup: 'us-east-1',
                workerId: 'i-0abc123',
                takenUntil: null,
                artifacts: {
                  pageInfo: {
                    hasNextPage: false,
                    hasPreviousPage: false,
                    cursor: 'initial',
                    previousCursor: null,
                    nextCursor: null,
                  },
                  edges: [
                    {
                      node: {
                        name: 'public/build/target.tar.gz',
                        contentType: 'application/x-tar',
                      },
                    },
                  ],
                },
              },
            ],
          },
          taskActions: {
            actions: [],
            variables: {},
            version: 1,
          },
          decisionTask: {
            scopes: [],
          },
        },
        dependents: {
          pageInfo: {
            hasNextPage: false,
            hasPreviousPage: false,
            cursor: 'initial',
            previousCursor: null,
            nextCursor: null,
          },
          edges: [],
        },
      },
    },
  },
];

describe('ViewTask page', () => {
  it('should render ViewTask page', async () => {
    await act(async () => {
      const { asFragment } = render(
        <MemoryRouter keyLength={0}>
          <MockedProvider mocks={mocks} addTypename={false}>
            <ViewTask match={{ params: { taskId } }} task={{ taskId }} />
          </MockedProvider>
        </MemoryRouter>
      );

      await waitFor(() => {});

      expect(asFragment()).toMatchSnapshot();
    });
  });
});
