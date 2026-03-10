import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import ListHooks from './index';
import hooksQuery from './hooks.graphql';

const mocks = [
  {
    request: {
      query: hooksQuery,
      variables: {
        filter: {
          hookGroupId: 'hg1',
        },
      },
    },
    result: {
      data: {
        hookGroups: [
          {
            hookGroupId: 'hg1',
            hooks: [
              {
                hookId: 'my-hook',
                hookGroupId: 'hg1',
                lastFire: {
                  taskId: 'abc123',
                  taskCreateTime: '2024-01-15T10:00:00.000Z',
                  result: 'success',
                  taskState: 'completed',
                  error: '',
                },
                bindings: [
                  {
                    exchange: 'exchange/taskcluster-queue/v1/task-completed',
                  },
                ],
                schedule: ['0 0 * * *'],
              },
              {
                hookId: 'another-hook',
                hookGroupId: 'hg1',
                lastFire: {
                  taskId: null,
                  taskCreateTime: null,
                  result: 'no-fire',
                  taskState: null,
                  error: '',
                },
                bindings: [],
                schedule: [],
              },
            ],
          },
        ],
      },
    },
  },
];

it('should render ListHooks page', async () => {
  await act(async () => {
    const { asFragment } = render(
      <MemoryRouter keyLength={0}>
        <MockedProvider mocks={mocks} addTypename={false}>
          <ListHooks
            match={{ params: { hookGroupId: 'hg1' } }}
            location={{
              search: {
                slice: jest.fn().mockReturnValue('search=test'),
              },
            }}
          />
        </MockedProvider>
      </MemoryRouter>
    );

    await waitFor(() => {});
    expect(asFragment()).toMatchSnapshot();
  });
});
