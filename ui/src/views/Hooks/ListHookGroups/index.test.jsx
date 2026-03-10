import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import ListHookGroups from './index';

it('should render ListHookGroupss page', async () => {
  await act(async () => {
    const { asFragment } = render(
      <MemoryRouter keyLength={0}>
        <MockedProvider mocks={[]} addTypename={false}>
          <ListHookGroups
            location={{
              search: {
                slice: jest.fn().mockReturnValue('search=test'),
              },
            }}
          />
        </MockedProvider>
      </MemoryRouter>
    );

    await waitFor(() => {});
    expect(asFragment()).toMatchSnapshot();
  });
});
