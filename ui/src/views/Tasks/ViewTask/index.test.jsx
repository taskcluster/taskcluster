import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import ViewTask from './index';

describe('ViewTask page', () => {
  it('should render ViewTask page', async () => {
    await act(async () => {
      const { asFragment } = render(
        <MemoryRouter keyLength={0}>
          <MockedProvider mocks={[]} addTypename={false}>
            <ViewTask match={{ params: {} }} task={{ taskId: 'taskId' }} />
          </MockedProvider>
        </MemoryRouter>
      );

      await waitFor(() => {});

      expect(asFragment()).toMatchSnapshot();
    });
  });
});
