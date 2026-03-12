import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { ApolloProvider } from 'react-apollo';
import setupClient from 'apollo-client-mock';
import { MemoryRouter } from 'react-router-dom';
import ListHookGroups from './index';

const typeDefs = `
  type User {
    id: ID!
  }
`;

it('should render ListHookGroupss page', async () => {
  const createClient = setupClient({}, typeDefs);

  await act(async () => {
    const { asFragment } = render(
      <MemoryRouter keyLength={0}>
        <ApolloProvider client={createClient()}>
          <ListHookGroups
            location={{
              search: {
                slice: vi.fn().mockReturnValue('search=test'),
              },
            }}
          />
        </ApolloProvider>
      </MemoryRouter>
    );

    await waitFor(() => {});
    expect(asFragment()).toMatchSnapshot();
  });
});
