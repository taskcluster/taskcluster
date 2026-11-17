import React from 'react';
import { screen, within } from '@testing-library/react';
import render from '../../utils/renderWithTheme';
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

it('should link an unsafe log artifact name to the artifact url', () => {
  const name = '%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/shell/x.log';

  render(
    <MemoryRouter keyLength={0}>
      <TaskRunsCard
        taskId="taskId"
        taskQueueId="task/queueId"
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
          },
        ]}
        artifacts={[
          {
            storageType: 's3',
            name,
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

  expect(screen.getByText(name).closest('a').getAttribute('href')).toEqual(
    'https://taskcluster.net/api/queue/v1/task/taskId/runs/0/artifacts/%252e%252e%2F%252e%252e%2F%252e%252e%2F%252e%252e%2F%252e%252e%2Fshell%2Fx.log'
  );
});

it('should render error artifacts as unavailable', () => {
  render(
    <MemoryRouter keyLength={0}>
      <TaskRunsCard
        taskId="taskId"
        taskQueueId="task/queueId"
        selectedRunId={0}
        runs={[
          {
            runId: 0,
            state: 'running',
            reasonCreated: 'scheduled',
            scheduled: '2022-02-03T14:41:19.706Z',
            started: '2022-02-03T14:43:54.086Z',
            takenUntil: '2022-02-03T15:03:54.082Z',
          },
        ]}
        artifacts={[
          {
            storageType: 'error',
            name: 'public/logs/live.log',
            contentType: 'text/plain',
          },
          {
            storageType: 'error',
            name: 'public/missing.json',
            contentType: 'application/json',
            contentLength: 2048,
          },
          {
            storageType: 's3',
            name: 'public/present.json',
            contentType: 'application/json',
          },
        ]}
        page={0}
        onNextPage={vi.fn()}
        onPreviousPage={vi.fn()}
      />
    </MemoryRouter>
  );

  const logRow = screen.getByText('public/logs/live.log').closest('tr');

  expect(within(logRow).getByTitle('View error')).toBeTruthy();
  expect(screen.queryByText('View Live Log')).toBeNull();

  const missingRow = screen.getByText('public/missing.json').closest('tr');

  expect(within(missingRow).getByTitle('View error')).toBeTruthy();
  expect(within(missingRow).queryByText('2 KB')).toBeNull();
  expect(within(missingRow).queryByTitle(/Artifact URL/)).toBeNull();
  expect(within(missingRow).getByRole('link').getAttribute('href')).toContain(
    '/artifacts/public%2Fmissing.json'
  );

  const presentRow = screen.getByText('public/present.json').closest('tr');

  expect(within(presentRow).queryByTitle('View error')).toBeNull();
  expect(within(presentRow).getByTitle(/Artifact URL/)).toBeTruthy();
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
