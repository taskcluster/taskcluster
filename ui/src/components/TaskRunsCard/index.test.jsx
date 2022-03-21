import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TaskRunsCard from './index';

it('should render TaskRunsCard', () => {
  const { asFragment } = render(
    <MemoryRouter keyLength={0}>
      <TaskRunsCard
        taskQueueId="task/queueId"
        task={{
          taskId: 'taskId',
          status: {
            taskId: 'taskId',
            provisioinerId: 'p1',
            workerType: 'workerType',
            taskGroupId: 'tg1',
            state: 'RUNNING',
          },
          taskQueueId: 'task/queueId',
          created: new Date().toISOString(),
          deadline: new Date().toISOString(),
          expires: new Date().toISOString(),
          scopes: ['scopes'],
          routes: [],
          payload: {
            command: [
              '/bin/bash',
              '-c',
              'for ((i=1;i<=600;i++)); do echo $i; sleep 1; done',
            ],
            image: 'ubuntu:latest',
            maxRunTime: 630,
          },
          metadata: {
            source: 'https://test.taskcluster-dev.net/task/taskId',
          },
          extra: {},
        }}
        selectedRunId=""
        runs={{}}
      />
    </MemoryRouter>
  );

  expect(asFragment()).toMatchSnapshot();
});
