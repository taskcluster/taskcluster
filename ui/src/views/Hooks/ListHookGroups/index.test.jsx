import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ListHookGroups from './index';

it('should render ListHookGroupss page', async () => {
  await act(async () => {
    const { asFragment } = render(
      <MemoryRouter keyLength={0}>
        <ListHookGroups
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
