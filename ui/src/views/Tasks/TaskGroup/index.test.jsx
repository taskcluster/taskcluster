import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import TaskGroup from './index';

describe('TaskGroup page', () => {
  it('should render TaskGroup page', async () => {
    const location = {
      hash: '#term',
    };

    await act(async () => {
      const { asFragment } = render(
        <MemoryRouter keyLength={0}>
          <MockedProvider mocks={[]} addTypename={false}>
            <TaskGroup
              match={{ params: { taskGroupId: 'aI8bvUB2SDmpHVqTUOFCWw' } }}
              location={location}
            />
          </MockedProvider>
        </MemoryRouter>
      );

      await waitFor(() => {});
      expect(asFragment()).toMatchSnapshot();
    });
  });
});
