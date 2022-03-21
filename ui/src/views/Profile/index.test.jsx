import React from 'react';
import { render } from '@testing-library/react';
import { ApolloProvider } from 'react-apollo';
import setupClient from 'apollo-client-mock';
import { MemoryRouter } from 'react-router-dom';
import Profile from './index';

const typeDefs = `
  type User {
    id: ID!
  }
`;

it('should render Profile page', () => {
  const createClient = setupClient({}, typeDefs);
  const { asFragment } = render(
    <MemoryRouter keyLength={0}>
      <ApolloProvider client={createClient()}>
        <Profile />
      </ApolloProvider>
    </MemoryRouter>
  );

  expect(asFragment()).toMatchSnapshot();
});
