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
        taskGroup={{ edges: [] }}
        filter="RUNNING"
        onStatusClick={nop}
        onUpdate={nop}
      />
    </MemoryRouter>
  );

  expect(asFragment()).toMatchSnapshot();
});
