import React from 'react';
import { render } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import Profile from './index';
import profileQuery from './profile.graphql';

const mocks = [
  {
    request: {
      query: profileQuery,
    },
    result: {
      data: {
        currentScopes: ['scope:read', 'scope:write', 'hooks:manage:*'],
      },
    },
  },
];

it('should render Profile page', () => {
  const { asFragment } = render(
    <MemoryRouter keyLength={0}>
      <MockedProvider mocks={mocks} addTypename={false}>
        <Profile />
      </MockedProvider>
    </MemoryRouter>
  );

  expect(asFragment()).toMatchSnapshot();
});
