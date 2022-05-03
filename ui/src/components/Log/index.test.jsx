import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import Log from './index';

it('should render Log', () => {
  const { asFragment } = render(
    <MemoryRouter keyLength={0}>
      <Log url="https://localhost:1234/logs/public/test.log" />
    </MemoryRouter>
  );

  expect(asFragment()).toMatchSnapshot();
});

it('should render without following', () => {
  const { asFragment } = render(
    <MemoryRouter
      initialEntries={[
        '/tasks/fXIp54zURQaV1pMTsiTvzw/runs/0/logs/public/logs/live.log#L123',
      ]}>
      <Log url="https://localhost:1234/logs/public/test.log" />
    </MemoryRouter>
  );

  expect(asFragment()).toMatchSnapshot();
});
