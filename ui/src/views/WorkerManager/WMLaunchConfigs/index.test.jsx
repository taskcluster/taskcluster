import React from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TaskclusterClientContext } from '../../../utils/TaskclusterClient';
import WMLaunchConfigs from './index';

// Dashboard renders null under jsdom (withWidth needs matchMedia), so render
// its children directly to assert on the table
vi.mock('../../../components/Dashboard', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

const workerPoolId = 'proj/worker';
const launchConfigId = 'lc-1';
const deferred = () => {
  let resolve;
  const promise = new Promise(r => {
    resolve = r;
  });

  return { promise, resolve };
};

it('shows worker counts that load after the launch configs', async () => {
  const workerPool = deferred();
  const workerPoolStats = deferred();
  const workerPoolErrorStats = deferred();
  const client = {
    listWorkerPoolLaunchConfigs: vi.fn().mockResolvedValue({
      workerPoolLaunchConfigs: [
        {
          launchConfigId,
          workerPoolId,
          isArchived: false,
          configuration: {},
          created: '2022-02-17T12:00:00.000Z',
          lastModified: '2022-02-17T12:00:00.000Z',
        },
      ],
    }),
    workerPool: vi.fn(() => workerPool.promise),
    workerPoolStats: vi.fn(() => workerPoolStats.promise),
    workerPoolErrorStats: vi.fn(() => workerPoolErrorStats.promise),
  };
  let container;

  await act(async () => {
    ({ container } = render(
      <MemoryRouter keyLength={0}>
        <TaskclusterClientContext.Provider value={() => client}>
          <WMLaunchConfigs
            match={{
              params: { workerPoolId: encodeURIComponent(workerPoolId) },
            }}
            location={{ search: '' }}
          />
        </TaskclusterClientContext.Provider>
      </MemoryRouter>
    ));
  });
  const countFor = state =>
    container.querySelector(`a[href$="state=${state}"]`)?.textContent;

  // the launch configs render before the stats have arrived
  expect(countFor('requested')).toBe('0');

  await act(async () => {
    workerPool.resolve({ workerPoolId, config: { maxCapacity: 10 } });
    workerPoolStats.resolve({
      workerPoolId,
      launchConfigStats: [
        {
          launchConfigId,
          currentCapacity: 10,
          requestedCapacity: 7,
          runningCapacity: 3,
          stoppingCapacity: 0,
          stoppedCapacity: 2,
          requestedCount: 7,
          runningCount: 3,
          stoppingCount: 0,
          stoppedCount: 2,
        },
      ],
    });
    workerPoolErrorStats.resolve({ totals: { launchConfig: {} } });
  });

  expect(countFor('requested')).toBe('7');
  expect(countFor('running')).toBe('3');
  expect(countFor('stopped')).toBe('2');
});

it('sorts by the worker count columns and marks the column it sorts by', async () => {
  const running = { 'lc-a': 1, 'lc-b': 5, 'lc-c': 3 };
  const client = {
    listWorkerPoolLaunchConfigs: vi.fn().mockResolvedValue({
      workerPoolLaunchConfigs: Object.keys(running).map(id => ({
        launchConfigId: id,
        workerPoolId,
        isArchived: false,
        configuration: {},
        created: '2022-02-17T12:00:00.000Z',
        lastModified: '2022-02-17T12:00:00.000Z',
      })),
    }),
    workerPool: vi.fn().mockResolvedValue({ workerPoolId, config: {} }),
    workerPoolStats: vi.fn().mockResolvedValue({
      workerPoolId,
      launchConfigStats: Object.entries(running).map(([id, n]) => ({
        launchConfigId: id,
        currentCapacity: n,
        requestedCapacity: 0,
        runningCapacity: n,
        stoppingCapacity: 0,
        stoppedCapacity: 0,
        requestedCount: 0,
        runningCount: n,
        stoppingCount: 0,
        stoppedCount: 0,
      })),
    }),
    workerPoolErrorStats: vi.fn().mockResolvedValue({ totals: {} }),
  };
  let container;

  await act(async () => {
    ({ container } = render(
      <MemoryRouter keyLength={0}>
        <TaskclusterClientContext.Provider value={() => client}>
          <WMLaunchConfigs
            match={{
              params: { workerPoolId: encodeURIComponent(workerPoolId) },
            }}
            location={{ search: '' }}
          />
        </TaskclusterClientContext.Provider>
      </MemoryRouter>
    ));
  });
  const order = () =>
    [...container.querySelectorAll('tbody tr')].map(
      row => row.cells[0].textContent
    );
  const header = container.querySelector('[id="workerStats.runningCount"]');

  expect(order()).toEqual(['lc-a', 'lc-b', 'lc-c']);

  await act(async () => header.click());
  expect(order()).toEqual(['lc-b', 'lc-c', 'lc-a']);
  expect(header.classList.contains('MuiTableSortLabel-active')).toBe(true);

  await act(async () => header.click());
  expect(order()).toEqual(['lc-a', 'lc-c', 'lc-b']);
});
