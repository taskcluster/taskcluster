import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Profile from './index';

it('should render Profile page', () => {
  const { asFragment } = render(
    <MemoryRouter keyLength={0}>
      <Profile />
    </MemoryRouter>
  );

  expect(asFragment()).toMatchSnapshot();
});
