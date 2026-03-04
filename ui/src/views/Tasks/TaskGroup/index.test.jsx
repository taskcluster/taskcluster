import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { ApolloProvider } from 'react-apollo';
import setupClient from 'apollo-client-mock';
import { MemoryRouter } from 'react-router-dom';
import TaskGroup from './index';

const typeDefs = `
  schema {
    query: TaskGroup
    subscription: TaskGroup
  }
  type Task {
    taskId: ID
  }
  type TaskActions {
    id: String
  }
  type TaskGroup {
    taskGroup: ID
    task: ID
    taskActions: TaskActions
  }
  enum TaskSubscriptions {
    tasksDefined
    tasksPending
    tasksRunning
    tasksCompleted
    tasksFailed
    tasksException
  }
  subscription TaskGroupSubscription {
    tasksSubscriptions: TaskSubscriptions
    state: String
    taskId: ID
    taskGroupId: ID
    task: String
  }
`;
const defaultMocks = {
  TaskGroup: () => ({
    taskGroup: () => ({
      taskId: 'taskId',
      taskGroupId: 'taskId',
    }),
    task: () => ({
      taskId: 'taskId',
      taskGroupId: 'taskId',
    }),
    taskActions: () => ({}),
  }),
  TaskGroupSubscription: () => ({
    tasksSubscriptions: () => ({
      taskId: 'taskId',
      taskGroupId: 'taskGroupId',
      state: 'state',
      task: {},
    }),
  }),
};

describe('TaskGroup page', () => {
  it('should render TaskGroup page', async () => {
    const createClient = setupClient(defaultMocks, typeDefs);
    const location = {
      hash: '#term',
    };

    await act(async () => {
      const { asFragment } = render(
        <MemoryRouter keyLength={0}>
          <ApolloProvider client={createClient()}>
            <TaskGroup
              match={{ params: { taskGroupId: 'aI8bvUB2SDmpHVqTUOFCWw' } }}
              location={location}
            />
          </ApolloProvider>
        </MemoryRouter>
      );

      await waitFor(() => {});
      expect(asFragment()).toMatchSnapshot();
    });
  });
});
