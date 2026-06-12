import React from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NoTaskGroup from './index';

const mockHistory = { push: vi.fn() };

const richRecord = {
  taskGroupId: 'GRP123defGRP123defGRP12',
  name: 'Decision Task',
  source:
    'https://hg.mozilla.org/mozilla-central/file/abc/taskcluster/ci/decision',
  taskQueueId: 'gecko-t/decision',
  created: '2022-02-10T10:00:00.000Z',
  statusCount: {
    completed: 8,
    failed: 1,
    exception: 0,
    running: 0,
    pending: 0,
    unscheduled: 1,
  },
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
// mounted tree is empty, so a full-render snapshot asserts nothing. Instead we
// drive the component's own render methods (renderTaskGroupRow /
// renderStatusCell) directly via a ref to the instance, rendering only the
// returned elements. This exercises the real invariants (INV-4, INV-5, INV-6,
// INV-8) without depending on Dashboard layout.
async function renderNoTaskGroupInstance() {
  vi.useRealTimers();
  const ref = React.createRef();

  await act(async () => {
    render(
      <MemoryRouter keyLength={0}>
        <NoTaskGroup ref={ref} history={mockHistory} />
      </MemoryRouter>
    );
    await new Promise(resolve => setImmediate(resolve));
  });

  return ref.current;
}

async function renderRow(element) {
  let container;

  await act(async () => {
    const result = render(
      <MemoryRouter keyLength={0}>
        <table>
          <tbody>{element}</tbody>
        </table>
      </MemoryRouter>
    );

    container = result.container;
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

  it('mounts and exposes its render methods', async () => {
    const instance = await renderNoTaskGroupInstance();

    expect(instance).not.toBeNull();
    expect(typeof instance.renderTaskGroupRow).toBe('function');
    expect(typeof instance.renderStatusCell).toBe('function');
  });

  it('renders all metadata for a rich record (INV-5)', async () => {
    const instance = await renderNoTaskGroupInstance();
    const container = await renderRow(instance.renderTaskGroupRow(richRecord));
    const text = container.textContent;

    expect(text).toContain(richRecord.taskGroupId);
    expect(text).toContain(richRecord.name);
    expect(text).toContain(richRecord.taskQueueId);
    // INV-5: a "viewed <…>" point-in-time recency label is present.
    expect(text).toMatch(/viewed/);
    // INV-8: a resolved state label renders (RUNNING because
    // pending/unscheduled > 0 in the fixture).
    expect(text).toContain('RUNNING');
    // The total task count shows in the status cell (8+1+0+0+0+1 = 10).
    expect(text).toContain('10 tasks');
  });

  it('always shows taskGroupId in its own copyable cell even when a name exists (INV-4)', async () => {
    const instance = await renderNoTaskGroupInstance();
    const container = await renderRow(instance.renderTaskGroupRow(richRecord));

    expect(container.querySelector('code').textContent).toBe(
      richRecord.taskGroupId
    );
    const idCellTitle = container
      .querySelector('[title]')
      .getAttribute('title');

    expect(idCellTitle).toContain(richRecord.taskGroupId);
    expect(idCellTitle).toMatch(/Copy/);
  });

  it('renders a legacy ID-only record without throwing and without a viewed label (INV-6)', async () => {
    const instance = await renderNoTaskGroupInstance();
    const container = await renderRow(
      instance.renderTaskGroupRow(legacyRecord)
    );
    const text = container.textContent;

    expect(text).toContain(legacyRecord.taskGroupId);
    // INV-6: a legacy record has no viewedAt, so no recency label renders.
    expect(text).not.toMatch(/viewed/);
  });

  it('renders the id as a clickable link in the Name cell when name is absent (SPEC-5, SPEC-6)', async () => {
    const instance = await renderNoTaskGroupInstance();
    const container = await renderRow(
      instance.renderTaskGroupRow(legacyRecord)
    );

    // The Name cell falls back to a link to the id instead of a blank cell.
    const link = container.querySelector('a');

    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe(
      `/tasks/groups/${legacyRecord.taskGroupId}`
    );
    expect(link.textContent).toBe(legacyRecord.taskGroupId);
  });

  it('renders a back-filled viewedAt:0 record and omits the viewed label (SPEC-1, SPEC-3)', async () => {
    const backFilledRecord = {
      taskGroupId: 'ZEROGRP0ZEROGRP0ZEROGRP',
      // Sentinel 0 is what the v1->v2 migration back-fills on legacy records.
      viewedAt: 0,
    };
    const instance = await renderNoTaskGroupInstance();
    const container = await renderRow(
      instance.renderTaskGroupRow(backFilledRecord)
    );
    const text = container.textContent;

    // SPEC-1: the record is visible (id rendered), not silently dropped.
    expect(text).toContain(backFilledRecord.taskGroupId);
    // SPEC-3: viewedAt 0 is falsy, so no "viewed" recency claim is shown.
    expect(text).not.toMatch(/viewed/);
    // The id is reachable via a link even without a name (SPEC-5).
    expect(container.querySelector('a').getAttribute('href')).toBe(
      `/tasks/groups/${backFilledRecord.taskGroupId}`
    );
  });

  it('omits the staleness label when viewedAt is absent but other metadata exists (INV-6)', async () => {
    const instance = await renderNoTaskGroupInstance();
    const container = await renderRow(
      instance.renderTaskGroupRow({
        taskGroupId: 'TAIL0012TAIL0012TAIL00',
        taskQueueId: 'gecko-t/x',
        created: '2022-02-10T10:00:00.000Z',
        statusCount: {
          completed: 1,
          failed: 0,
          exception: 0,
          running: 0,
          pending: 0,
          unscheduled: 0,
        },
        // No viewedAt (legacy / pre-v2 shape).
      })
    );

    expect(container.textContent).toContain('gecko-t/x');
    expect(container.textContent).not.toMatch(/viewed/);
  });

  it('labels a fully-completed resolved group as COMPLETED (INV-8)', async () => {
    const instance = await renderNoTaskGroupInstance();
    const text = await textOf(
      instance.renderStatusCell({
        completed: 5,
        failed: 0,
        exception: 0,
        running: 0,
        pending: 0,
        unscheduled: 0,
      })
    );

    expect(text).toContain('COMPLETED');
    // INV-8: the per-state breakdown moves into the tooltip, not the cell text.
    expect(text).toContain('5 tasks');
    expect(text).not.toContain('5 completed');
  });

  it('labels a group with failures as FAILED even when some completed (INV-8)', async () => {
    const instance = await renderNoTaskGroupInstance();
    const text = await textOf(
      instance.renderStatusCell({
        completed: 5,
        failed: 2,
        exception: 0,
        running: 0,
        pending: 0,
        unscheduled: 0,
      })
    );

    expect(text).toContain('FAILED');
    expect(text).toContain('7 tasks');
    expect(text).not.toContain('2 failed');
  });

  it('labels an exception-only resolved group as FAILED (INV-8)', async () => {
    const instance = await renderNoTaskGroupInstance();
    const text = await textOf(
      instance.renderStatusCell({
        completed: 3,
        failed: 0,
        exception: 2,
        running: 0,
        pending: 0,
        unscheduled: 0,
      })
    );

    expect(text).toContain('FAILED');
    expect(text).toContain('5 tasks');
  });

  it('places the full per-state breakdown in the StatusLabel tooltip (INV-8)', async () => {
    const instance = await renderNoTaskGroupInstance();
    const cell = instance.renderStatusCell({
      completed: 8,
      failed: 1,
      exception: 0,
      running: 0,
      pending: 0,
      unscheduled: 1,
    });

    // The breakdown is serialized into the StatusLabel's `title`, which spreads
    // onto the rendered element as a native title attribute. Render the cell and
    // read that attribute (textContent won't see attribute values).
    let title;

    await act(async () => {
      const { container } = render(<div>{cell}</div>);

      title = container.querySelector('[title]').getAttribute('title');
    });

    expect(title).toContain('8 completed');
    expect(title).toContain('1 failed');
    expect(title).toContain('1 unscheduled');
    expect(title).toContain('recorded at view time; may be stale');
  });

  it('returns null for a statusCount with no tasks (INV-8)', async () => {
    const instance = await renderNoTaskGroupInstance();

    expect(
      instance.renderStatusCell({
        completed: 0,
        failed: 0,
        exception: 0,
        running: 0,
        pending: 0,
        unscheduled: 0,
      })
    ).toBeNull();
    expect(instance.renderStatusCell(undefined)).toBeNull();
  });
});
