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
