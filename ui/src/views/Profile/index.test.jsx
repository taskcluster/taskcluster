import React from 'react';
import { render } from '@testing-library/react';
import { ApolloProvider } from '@apollo/client';
import setupClient from '../../utils/mockApolloClient';
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
