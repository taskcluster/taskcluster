import React from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
}));

// NoTaskGroup renders inside <Dashboard>, which is decorated with Material-UI's
// withWidth; in jsdom (no window.matchMedia) withWidth returns null and the
// mounted tree is empty, so a full-render assertion would assert nothing.
// Instead we grab the instance and drive its own helpers (renderTaskGroupRow,
// renderStatusCell, sortedTaskGroups) directly. vitest.setup.js installs fake
// timers, so mounting must settle componentDidMount on microtasks only -- a
// timer-based flush would never fire.
async function mountNoTaskGroup() {
  const ref = React.createRef();

  await act(async () => {
    render(
      <MemoryRouter keyLength={0}>
        <NoTaskGroup ref={ref} history={mockHistory} />
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

async function textOf(element) {
  let text = '';

  await act(async () => {
    const { container } = render(<div>{element}</div>);

    text = container.textContent;
  });

  return text;
}

describe('NoTaskGroup page', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders all stored metadata for a record', async () => {
    const instance = await mountNoTaskGroup();
    const container = await renderRow(instance.renderTaskGroupRow(richRecord));
    const { textContent } = container;

    expect(textContent).toContain(richRecord.name);
    expect(textContent).toContain(richRecord.taskQueueId);
    expect(textContent).toMatch(/viewed/);
    expect(textContent).toContain('10 tasks');
    expect(textContent).toContain('RUNNING');
    expect(container.querySelector('code').textContent).toBe(
      richRecord.taskGroupId
    );
    const titles = Array.from(container.querySelectorAll('[title]')).map(el =>
      el.getAttribute('title')
    );

    expect(titles).toContain('State recorded at view time; may be stale');
  });

  it('renders a legacy ID-only record with no viewed label and a linked ID', async () => {
    const instance = await mountNoTaskGroup();
    const container = await renderRow(
      instance.renderTaskGroupRow(legacyRecord)
    );

    expect(container.textContent).toContain(legacyRecord.taskGroupId);
    expect(container.textContent).not.toMatch(/viewed/);
    const link = container.querySelector('a');

    expect(link.getAttribute('href')).toBe(
      `/tasks/groups/${legacyRecord.taskGroupId}`
    );
    expect(link.textContent).toBe(legacyRecord.taskGroupId);
  });

  it('omits the viewed label for the viewedAt:0 the v1->v2 migration back-fills', async () => {
    const instance = await mountNoTaskGroup();
    const container = await renderRow(
      instance.renderTaskGroupRow({
        taskGroupId: legacyRecord.taskGroupId,
        viewedAt: 0,
      })
    );

    expect(container.textContent).toContain(legacyRecord.taskGroupId);
    expect(container.textContent).not.toMatch(/viewed/);
  });

  it('resolves the status label from the recorded counts', async () => {
    const instance = await mountNoTaskGroup();

    expect(
      await textOf(instance.renderStatusCell(statusCount({ completed: 5 })))
    ).toContain('COMPLETED');
    expect(
      await textOf(
        instance.renderStatusCell(statusCount({ completed: 5, failed: 2 }))
      )
    ).toContain('FAILED');
    expect(
      await textOf(
        instance.renderStatusCell(statusCount({ completed: 3, exception: 2 }))
      )
    ).toContain('FAILED');
    expect(
      await textOf(
        instance.renderStatusCell(statusCount({ failed: 1, pending: 1 }))
      )
    ).toContain('RUNNING');
  });

  it('renders no status cell when there are no counted tasks', async () => {
    const instance = await mountNoTaskGroup();

    expect(instance.renderStatusCell(statusCount({}))).toBeNull();
    expect(instance.renderStatusCell(undefined)).toBeNull();
  });

  it('sorts by the clicked column and toggles direction on a second click', async () => {
    const instance = await mountNoTaskGroup();
    const groups = [
      { taskGroupId: 'b', name: 'beta' },
      { taskGroupId: 'c', name: 'gamma' },
      { taskGroupId: 'a', name: 'alpha' },
    ];

    act(() => instance.setState({ recentTaskGroups: groups }));
    // Untouched until a header is clicked: recency order from the db query.
    expect(instance.sortedTaskGroups()).toBe(groups);

    act(() => instance.handleHeaderClick({ id: 'name' }));
    expect(instance.sortedTaskGroups().map(g => g.name)).toEqual([
      'gamma',
      'beta',
      'alpha',
    ]);

    act(() => instance.handleHeaderClick({ id: 'name' }));
    expect(instance.sortedTaskGroups().map(g => g.name)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
    // Sorting must not reorder the array held in state.
    expect(groups.map(g => g.name)).toEqual(['beta', 'gamma', 'alpha']);
  });

  it('sorts the Status column by total task count', async () => {
    const instance = await mountNoTaskGroup();

    act(() =>
      instance.setState({
        recentTaskGroups: [
          { taskGroupId: 'a', statusCount: statusCount({ completed: 2 }) },
          { taskGroupId: 'b', statusCount: statusCount({ completed: 9 }) },
          { taskGroupId: 'c' },
        ],
      })
    );
    act(() => instance.handleHeaderClick({ id: 'statusCount' }));

    expect(instance.sortedTaskGroups().map(g => g.taskGroupId)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });
});
