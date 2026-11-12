import React from 'react';
import render from '../../utils/renderWithTheme';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import Profile from './index';

it('should render Profile page', () => {
  const { asFragment } = render(
    <HelmetProvider>
      <MemoryRouter keyLength={0}>
        <Profile />
      </MemoryRouter>
    </HelmetProvider>
  );

  expect(asFragment()).toMatchSnapshot();
});
