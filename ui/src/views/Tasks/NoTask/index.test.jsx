import React from 'react';
import { render, act, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import db from '../../../utils/db';
import NoTask from './index';

const mockHistory = { push: vi.fn() };

const richRecord = {
  taskId: 'ABC123defABC123defABC12',
  name: 'build-linux',
  taskQueueId: 'gecko-t/t-linux-xlarge-source',
  created: '2022-02-10T10:00:00.000Z',
  state: 'COMPLETED',
  viewedAt: 1644912000000,
};

const legacyRecord = {
  taskId: 'ZYX987utsZYX987utsZYX98',
};

vi.mock('../../../utils/db', () => ({
  default: {
    taskIdsHistory: {
      orderBy: vi.fn().mockReturnThis(),
      reverse: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn(),
    },
  },
}));

// Fake timers are global (see vitest.setup.js), so settle on microtasks.
async function renderPage(records) {
  db.taskIdsHistory.toArray.mockResolvedValue(records);
  let container;

  await act(async () => {
    ({ container } = render(
      <HelmetProvider>
        <MemoryRouter keyLength={0}>
          <NoTask history={mockHistory} />
        </MemoryRouter>
      </HelmetProvider>
    ));
  });
  await act(async () => {});

  return container.querySelector('table');
}

const rows = table => Array.from(table.querySelectorAll('tbody tr'));
const names = table => rows(table).map(row => row.cells[1].textContent);

describe('NoTask page', () => {
  it('renders all stored metadata for a record', async () => {
    const [row] = rows(await renderPage([richRecord]));
    const { textContent } = row;

    expect(textContent).toContain(richRecord.name);
    expect(textContent).toContain(richRecord.taskQueueId);
    expect(textContent).toContain(richRecord.state);
    expect(textContent).toMatch(/viewed/);
    expect(row.querySelector('code').textContent).toBe(richRecord.taskId);
    expect(row.cells[2].getAttribute('title')).toBe(
      'State recorded at view time; may be stale'
    );
  });

  it('renders a legacy ID-only record with no viewed label and a linked ID', async () => {
    const [row] = rows(await renderPage([legacyRecord]));

    expect(row.textContent).toContain(legacyRecord.taskId);
    expect(row.textContent).not.toMatch(/viewed/);
    const link = row.querySelector('a');

    expect(link.getAttribute('href')).toBe(`/tasks/${legacyRecord.taskId}`);
    expect(link.textContent).toBe(legacyRecord.taskId);
  });

  it('omits the viewed label for the viewedAt:0 the v1->v2 migration back-fills', async () => {
    const [row] = rows(
      await renderPage([{ taskId: legacyRecord.taskId, viewedAt: 0 }])
    );

    expect(row.textContent).toContain(legacyRecord.taskId);
    expect(row.textContent).not.toMatch(/viewed/);
  });

  it('sorts by the clicked column and toggles direction on a second click', async () => {
    const tasks = [
      { taskId: 'b', name: 'beta' },
      { taskId: 'c', name: 'gamma' },
      { taskId: 'a', name: 'alpha' },
    ];
    const table = await renderPage(tasks);
    const nameHeader = within(table).getByRole('button', { name: 'Name' });

    // Untouched until a header is clicked: recency order from the db query.
    expect(names(table)).toEqual(['beta', 'gamma', 'alpha']);

    fireEvent.click(nameHeader);
    expect(names(table)).toEqual(['gamma', 'beta', 'alpha']);

    fireEvent.click(nameHeader);
    expect(names(table)).toEqual(['alpha', 'beta', 'gamma']);
    // Sorting must not reorder the records loaded from the db.
    expect(tasks.map(t => t.name)).toEqual(['beta', 'gamma', 'alpha']);
  });
});
