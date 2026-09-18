import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TaskRunsCard from './index';

it('should render TaskRunsCard', () => {
  const { asFragment } = render(
    <MemoryRouter keyLength={0}>
      <TaskRunsCard
        taskId="eR1kMya2SruyMaRMZguROg"
        taskQueueId="task/queueId"
        liveLogName="apple/banana.log"
        selectedRunId={0}
        runs={[
          {
            runId: 0,
            state: 'completed',
            reasonCreated: 'scheduled',
            reasonResolved: 'completed',
            scheduled: '2022-02-03T14:41:19.706Z',
            started: '2022-02-03T14:43:54.086Z',
            resolved: '2022-02-03T14:45:28.396Z',
            workerGroup: 'us-east1',
            workerId: '7421215367664916236',
            takenUntil: '2022-02-03T15:03:54.082Z',
          },
        ]}
        artifacts={[
          {
            storageType: 's3',
            name: 'public/coverage-final.json',
            contentType: 'application/json',
            contentLength: 2048,
            expires: '2023-02-03T14:41:19.706Z',
          },
          {
            storageType: 's3',
            name: 'public/logs/live_backing.log',
            contentType: 'text/plain; charset=utf-8',
            expires: '2023-02-03T14:41:19.706Z',
          },
          {
            storageType: 'link',
            name: 'apple/banana.log',
            contentType: 'text/plain; charset=utf-8',
            expires: '2023-02-03T14:41:19.706Z',
          },
        ]}
        page={0}
        onNextPage={vi.fn()}
        onPreviousPage={vi.fn()}
      />
    </MemoryRouter>
  );

  expect(asFragment()).toMatchSnapshot();
});

it('should render the no-runs state', () => {
  const { getByText } = render(
    <MemoryRouter keyLength={0}>
      <TaskRunsCard
        taskId="eR1kMya2SruyMaRMZguROg"
        taskQueueId="task/queueId"
        selectedRunId={0}
        runs={[]}
        page={0}
        onNextPage={vi.fn()}
        onPreviousPage={vi.fn()}
      />
    </MemoryRouter>
  );

  expect(getByText('No Runs')).toBeTruthy();
});
