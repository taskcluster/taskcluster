import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { TaskclusterClientContext } from '../../../utils/TaskclusterClient';
import ListHookGroups from './index';

const client = {
  listHookGroups: vi.fn().mockResolvedValue({ groups: ['hg1', 'hg2'] }),
};

it('should render ListHookGroupss page', async () => {
  await act(async () => {
    const { asFragment } = render(
      <HelmetProvider>
        <MemoryRouter keyLength={0}>
          <TaskclusterClientContext.Provider value={() => client}>
            <ListHookGroups
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
