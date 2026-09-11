import React from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
}));

// Dashboard's withWidth renders null in jsdom, so assert against the instance's
// own helpers rather than the mounted tree. Fake timers are global (see
// vitest.setup.js), so mounting must settle on microtasks, not a timer.
async function mountNoTask() {
  const ref = React.createRef();

  await act(async () => {
    render(
      <MemoryRouter keyLength={0}>
        <NoTask ref={ref} history={mockHistory} />
      </MemoryRouter>
    );
  });
  await act(async () => {});

  return ref.current;
}

async function renderRow(element) {
  let container;

  await act(async () => {
    ({ container } = render(
      <MemoryRouter keyLength={0}>
        <table>
          <tbody>{element}</tbody>
        </table>
      </MemoryRouter>
    ));
  });

  return container;
}

describe('NoTask page', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders all stored metadata for a record', async () => {
    const instance = await mountNoTask();
    const container = await renderRow(instance.renderTaskRow(richRecord));
    const { textContent } = container;

    expect(textContent).toContain(richRecord.name);
    expect(textContent).toContain(richRecord.taskQueueId);
    expect(textContent).toContain(richRecord.state);
    expect(textContent).toMatch(/viewed/);
    expect(container.querySelector('code').textContent).toBe(richRecord.taskId);
    const titles = Array.from(container.querySelectorAll('[title]')).map(el =>
      el.getAttribute('title')
    );

    expect(titles).toContain('State recorded at view time; may be stale');
  });

  it('renders a legacy ID-only record with no viewed label and a linked ID', async () => {
    const instance = await mountNoTask();
    const container = await renderRow(instance.renderTaskRow(legacyRecord));

    expect(container.textContent).toContain(legacyRecord.taskId);
    expect(container.textContent).not.toMatch(/viewed/);
    const link = container.querySelector('a');

    expect(link.getAttribute('href')).toBe(`/tasks/${legacyRecord.taskId}`);
    expect(link.textContent).toBe(legacyRecord.taskId);
  });

  it('omits the viewed label for the viewedAt:0 the v1->v2 migration back-fills', async () => {
    const instance = await mountNoTask();
    const container = await renderRow(
      instance.renderTaskRow({ taskId: legacyRecord.taskId, viewedAt: 0 })
    );

    expect(container.textContent).toContain(legacyRecord.taskId);
    expect(container.textContent).not.toMatch(/viewed/);
  });

  it('sorts by the clicked column and toggles direction on a second click', async () => {
    const instance = await mountNoTask();
    const tasks = [
      { taskId: 'b', name: 'beta' },
      { taskId: 'c', name: 'gamma' },
      { taskId: 'a', name: 'alpha' },
    ];

    act(() => instance.setState({ recentTasks: tasks }));
    // Untouched until a header is clicked: recency order from the db query.
    expect(instance.sortedTasks()).toBe(tasks);

    act(() => instance.handleHeaderClick({ id: 'name' }));
    expect(instance.sortedTasks().map(t => t.name)).toEqual([
      'gamma',
      'beta',
      'alpha',
    ]);

    act(() => instance.handleHeaderClick({ id: 'name' }));
    expect(instance.sortedTasks().map(t => t.name)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
    // Sorting must not reorder the array held in state.
    expect(tasks.map(t => t.name)).toEqual(['beta', 'gamma', 'alpha']);
  });
});
