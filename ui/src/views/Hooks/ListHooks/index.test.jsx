import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ListHooks from './index';

it('should render ListHooks page', async () => {
  await act(async () => {
    const { asFragment } = render(
      <MemoryRouter keyLength={0}>
        <ListHooks
          match={{ params: { hookGroupId: 'hg1' } }}
          location={{
            search: {
              slice: vi.fn().mockReturnValue('search=test'),
            },
          }}
        />
      </MemoryRouter>
    );

    await waitFor(() => {});
    expect(asFragment()).toMatchSnapshot();
  });
});
