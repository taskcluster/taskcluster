import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import render from '../../utils/renderWithTheme';
import { MemoryRouter } from 'react-router-dom';
import TaskRunsCard from './index';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../../theme';

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

it.each(['lightTheme', 'darkTheme'])(
  'should keep unavailable artifacts non-interactive in %s',
  themeName => {
    render(
      <ThemeProvider theme={theme[themeName]}>
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
                takenUntil: '2022-02-03T15:03:54.082Z',
              },
            ]}
            artifacts={[
              ...['object', 's3', 'reference', 'link'].map(storageType => ({
                storageType,
                name: `public/${storageType}.txt`,
                contentType: 'text/plain',
              })),
              {
                storageType: 'error',
                name: 'public/logs/live.log',
                contentType: 'text/plain',
              },
            ]}
            page={0}
            onNextPage={vi.fn()}
            onPreviousPage={vi.fn()}
          />
        </MemoryRouter>
      </ThemeProvider>
    );

    const unavailableRow = screen
      .getByText('public/logs/live.log')
      .closest('tr');
    const unavailable = within(unavailableRow);

    expect(unavailable.getByRole('status').textContent).toBe('UNAVAILABLE');
    expect(unavailable.queryByRole('link')).toBeNull();
    expect(unavailable.queryByRole('button')).toBeNull();
    expect(unavailable.queryByTitle(/Artifact URL/)).toBeNull();
    // Only the file-type icon remains; no copy or navigation icons.
    expect(unavailableRow.querySelectorAll('svg')).toHaveLength(1);
    expect(unavailableRow.querySelector('[href], [tabindex="0"]')).toBeNull();
    expect(screen.queryByText('View Live Log')).toBeNull();

    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    fireEvent.click(unavailable.getByText('public/logs/live.log'));
    expect(open).not.toHaveBeenCalled();

    for (const storageType of ['object', 's3', 'reference', 'link']) {
      const name = `public/${storageType}.txt`;
      const row = screen.getByText(name).closest('tr');
      const available = within(row);
      const link = available.getByRole('link', { name });

      expect(available.queryByText('UNAVAILABLE')).toBeNull();
      expect(link.getAttribute('href')).toContain(
        `/artifacts/public%2F${storageType}.txt`
      );
      expect(available.getByTitle(/Artifact URL/)).toBeTruthy();
      expect(row.querySelectorAll('svg')).toHaveLength(3);
      fireEvent.click(link);
      expect(open).toHaveBeenLastCalledWith(
        link.href,
        '_blank',
        'noopener,noreferrer'
      );
    }

    open.mockRestore();
  }
);

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
