import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TaskGroupProgress from './index';

it('should render TaskGroupProgress', () => {
  const nop = () => {};
  const { asFragment } = render(
    <MemoryRouter keyLength={0}>
      <TaskGroupProgress
        taskGroupId="abc"
        taskGroupLoaded={false}
        statusCount={{
          completed: 0,
          failed: 0,
          exception: 0,
          running: 0,
          pending: 0,
          unscheduled: 0,
        }}
        filter="RUNNING"
        onStatusClick={nop}
      />
    </MemoryRouter>
  );

  expect(asFragment()).toMatchSnapshot();
});
