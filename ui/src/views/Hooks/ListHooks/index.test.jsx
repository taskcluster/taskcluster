import React from 'react';
import { waitFor, act } from '@testing-library/react';
import render from '../../../utils/renderWithTheme';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { TaskclusterClientContext } from '../../../utils/TaskclusterClient';
import ListHooks from './index';

const client = {
  listHooks: vi.fn().mockResolvedValue({
    hooks: [{ hookGroupId: 'hg1', hookId: 'hook1' }],
  }),
  listLastFires: vi.fn().mockResolvedValue({ lastFires: [] }),
};

it('should render ListHooks page', async () => {
  await act(async () => {
    const { asFragment } = render(
      <HelmetProvider>
        <MemoryRouter keyLength={0}>
          <TaskclusterClientContext.Provider value={() => client}>
            <ListHooks
              match={{ params: { hookGroupId: 'hg1' } }}
              location={{
                search: {
                  slice: vi.fn().mockReturnValue('search=test'),
                },
              }}
            />
          </TaskclusterClientContext.Provider>
        </MemoryRouter>
      </HelmetProvider>
    );

    await waitFor(() => {});
    expect(asFragment()).toMatchSnapshot();
  });
});
