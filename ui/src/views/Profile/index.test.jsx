import React from 'react';
import { render } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import Profile from './index';

it('should render Profile page', () => {
  const { asFragment } = render(
    <MemoryRouter keyLength={0}>
      <MockedProvider mocks={[]} addTypename={false}>
        <Profile />
      </MockedProvider>
    </MemoryRouter>
  );

  expect(asFragment()).toMatchSnapshot();
});
