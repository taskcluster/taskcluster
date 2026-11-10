import React from 'react';
import { act, fireEvent, within } from '@testing-library/react';
import render from '../../../utils/renderWithTheme';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import db from '../../../utils/db';
import NoTaskGroup from './index';

const mockHistory = { push: vi.fn() };

const statusCount = ({
  completed = 0,
  failed = 0,
  exception = 0,
  running = 0,
  pending = 0,
  unscheduled = 0,
}) => ({ completed, failed, exception, running, pending, unscheduled });

const richRecord = {
  taskGroupId: 'GRP123defGRP123defGRP12',
  name: 'Decision Task',
  taskQueueId: 'gecko-t/decision',
  created: '2022-02-10T10:00:00.000Z',
  statusCount: statusCount({ completed: 8, failed: 1, unscheduled: 1 }),
  viewedAt: 1644912000000,
};

const legacyRecord = {
  taskGroupId: 'LEG987utsLEG987utsLEG98',
};

vi.mock('../../../utils/db', () => ({
  default: {
    taskGroupIdsHistory: {
      orderBy: vi.fn().mockReturnThis(),
      reverse: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn(),
    },
  },
}));

// Fake timers are global (see vitest.setup.js), so settle on microtasks.
async function renderPage(records) {
  db.taskGroupIdsHistory.toArray.mockResolvedValue(records);
  let container;

  await act(async () => {
    ({ container } = render(
      <HelmetProvider>
        <MemoryRouter keyLength={0}>
          <NoTaskGroup history={mockHistory} />
        </MemoryRouter>
      </HelmetProvider>
    ));
  });
  await act(async () => {});

  return container.querySelector('table');
}

const rows = table => Array.from(table.querySelectorAll('tbody tr'));
const column = (table, index) =>
  rows(table).map(row => row.cells[index].textContent);

describe('NoTaskGroup page', () => {
  it('renders all stored metadata for a record', async () => {
    const [row] = rows(await renderPage([richRecord]));
    const { textContent } = row;

    expect(textContent).toContain(richRecord.name);
    expect(textContent).toContain(richRecord.taskQueueId);
    expect(textContent).toMatch(/viewed/);
    expect(textContent).toContain('10 tasks');
    expect(textContent).toContain('RUNNING');
    expect(row.querySelector('code').textContent).toBe(richRecord.taskGroupId);
    expect(row.cells[2].getAttribute('title')).toBe(
      'State recorded at view time; may be stale'
    );
  });

  it('renders a legacy ID-only record with no viewed label and a linked ID', async () => {
    const [row] = rows(await renderPage([legacyRecord]));

    expect(row.textContent).toContain(legacyRecord.taskGroupId);
    expect(row.textContent).not.toMatch(/viewed/);
    const link = row.querySelector('a');

    expect(link.getAttribute('href')).toBe(
      `/tasks/groups/${legacyRecord.taskGroupId}`
    );
    expect(link.textContent).toBe(legacyRecord.taskGroupId);
  });

  it('omits the viewed label for the viewedAt:0 the v1->v2 migration back-fills', async () => {
    const [row] = rows(
      await renderPage([{ taskGroupId: legacyRecord.taskGroupId, viewedAt: 0 }])
    );

    expect(row.textContent).toContain(legacyRecord.taskGroupId);
    expect(row.textContent).not.toMatch(/viewed/);
  });

  it('resolves the status label from the recorded counts', async () => {
    const table = await renderPage([
      { taskGroupId: 'a', statusCount: statusCount({ completed: 5 }) },
      {
        taskGroupId: 'b',
        statusCount: statusCount({ completed: 5, failed: 2 }),
      },
      {
        taskGroupId: 'c',
        statusCount: statusCount({ completed: 3, exception: 2 }),
      },
      { taskGroupId: 'd', statusCount: statusCount({ failed: 1, pending: 1 }) },
    ]);

    expect(column(table, 2)).toEqual([
      '5 tasks COMPLETED',
      '7 tasks FAILED',
      '5 tasks FAILED',
      '2 tasks RUNNING',
    ]);
  });

  it('renders an empty status cell when there are no counted tasks', async () => {
    const table = await renderPage([
      { taskGroupId: 'a', statusCount: statusCount({}) },
      { taskGroupId: 'b' },
    ]);

    expect(column(table, 2)).toEqual(['', '']);
  });

  it('sorts by the clicked column and toggles direction on a second click', async () => {
    const groups = [
      { taskGroupId: 'b', name: 'beta' },
      { taskGroupId: 'c', name: 'gamma' },
      { taskGroupId: 'a', name: 'alpha' },
    ];
    const table = await renderPage(groups);
    const nameHeader = within(table).getByRole('button', { name: 'Name' });

    // Untouched until a header is clicked: recency order from the db query.
    expect(column(table, 1)).toEqual(['beta', 'gamma', 'alpha']);

    fireEvent.click(nameHeader);
    expect(column(table, 1)).toEqual(['gamma', 'beta', 'alpha']);

    fireEvent.click(nameHeader);
    expect(column(table, 1)).toEqual(['alpha', 'beta', 'gamma']);
    // Sorting must not reorder the records loaded from the db.
    expect(groups.map(g => g.name)).toEqual(['beta', 'gamma', 'alpha']);
  });

  it('sorts the Status column by total task count', async () => {
    const table = await renderPage([
      { taskGroupId: 'a', statusCount: statusCount({ completed: 2 }) },
      { taskGroupId: 'b', statusCount: statusCount({ completed: 9 }) },
      { taskGroupId: 'c' },
    ]);

    fireEvent.click(within(table).getByRole('button', { name: 'Status' }));

    expect(column(table, 0)).toEqual(['b', 'a', 'c']);
  });
});
