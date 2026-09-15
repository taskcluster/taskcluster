import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TaskDetailsCard from './index';

const task = {
  taskQueueId: 'task/queue/id',
  schedulerId: 'test-scheduler',
  projectId: 'none',
  taskGroupId: 'tg1',
  priority: 'very-high',
  requires: 'all-completed',
  retries: 5,
  created: '2022-02-15T12:00:00.000Z',
  deadline: '2022-05-15T12:00:00.000Z',
  expires: '2023-02-15T12:00:00.000Z',
  scopes: ['scopes'],
  routes: [],
  dependencies: [],
  payload: {
    command: [
      '/bin/bash',
      '-c',
      'for ((i=1;i<=60;i++)); do echo $i; sleep 1; done',
    ],
    image: 'ubuntu:latest',
    maxRunTime: 90,
  },
  metadata: {
    source: 'https://test.taskcluster-dev.net/task/taskId',
  },
  extra: {},
};
const status = {
  taskId: 'taskId',
  taskGroupId: 'tg1',
  state: 'running',
  retriesLeft: 5,
  runs: [],
};
const renderCard = props =>
  render(
    <MemoryRouter keyLength={0}>
      <TaskDetailsCard
        taskId="taskId"
        task={task}
        status={status}
        page={0}
        onNextPage={vi.fn()}
        onPreviousPage={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  );

it('should render TaskDetailsCard', () => {
  const { asFragment } = renderCard();

  expect(asFragment()).toMatchSnapshot();
});

it('should list the dependents page as reported by the queue', () => {
  const { getByText } = renderCard({
    dependents: [
      {
        task: { taskGroupId: 'tg1', metadata: { name: 'a dependent task' } },
        status: { taskId: 'dependentTaskId', state: 'unscheduled', runs: [] },
      },
    ],
  });

  expect(getByText('a dependent task')).toBeTruthy();
  expect(getByText('UNSCHEDULED')).toBeTruthy();
});
