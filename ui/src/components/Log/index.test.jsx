import React from 'react';
import { act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import render from '../../utils/renderWithTheme';
import Log from './index';

it('should render Log', async () => {
  const { asFragment } = render(
    <MemoryRouter keyLength={0}>
      <Log url="https://localhost:1234/logs/public/test.log" />
    </MemoryRouter>
  );

  await act(async () => {});

  expect(asFragment()).toMatchSnapshot();
});

it('should render without following', async () => {
  const { asFragment } = render(
    <MemoryRouter
      initialEntries={[
        '/tasks/fXIp54zURQaV1pMTsiTvzw/runs/0/logs/live/public/logs/live.log#L123',
      ]}>
      <Log url="https://localhost:1234/logs/public/test.log" />
    </MemoryRouter>
  );

  await act(async () => {});

  expect(asFragment()).toMatchSnapshot();
});
