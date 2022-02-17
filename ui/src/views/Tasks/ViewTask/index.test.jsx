import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { ApolloProvider } from 'react-apollo';
import setupClient from 'apollo-client-mock';
import { MemoryRouter } from 'react-router-dom';
import ViewTask from './index';

const typeDefs = `
  type Task {
    task: Task!
  }
`;
const defaultMocks = {
  Task: () => ({
    task: () => ({
      taskId: 'taskId',
    }),
  }),
};

describe('ViewTask page', () => {
  it('should render ViewTask page', async () => {
    const createClient = setupClient(defaultMocks, typeDefs);

    await act(async () => {
      const { asFragment } = render(
        <MemoryRouter keyLength={0}>
          <ApolloProvider client={createClient()}>
            <ViewTask match={{ params: {} }} task={{ taskId: 'taskId' }} />
          </ApolloProvider>
        </MemoryRouter>
      );

      await waitFor(() => {});

      expect(asFragment()).toMatchSnapshot();
    });
  });
});
