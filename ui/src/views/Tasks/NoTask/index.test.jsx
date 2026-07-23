import React from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NoTask from './index';

const mockHistory = { push: vi.fn() };

const richRecord = {
  taskId: 'ABC123defABC123defABC12',
  name: 'build-linux',
  source:
    'https://hg.mozilla.org/mozilla-central/file/abc/taskcluster/ci/build/linux.yml',
  taskQueueId: 'gecko-t/t-linux-xlarge-source',
  created: '2022-02-10T10:00:00.000Z',
  deadline: '2022-02-11T10:00:00.000Z',
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

// NoTask renders inside <Dashboard>, which is decorated with Material-UI's
// withWidth; in jsdom (no window.matchMedia) withWidth returns null and the
// mounted tree is empty, so a full-render snapshot asserts nothing. Instead we
// drive the component's own render method (renderTaskRow) directly via a ref
// to the instance, rendering only the returned element. This exercises the
// real invariants (INV-4, INV-5, INV-6) without depending on Dashboard layout.
async function renderNoTaskInstance() {
  // Real timers so the async componentDidMount promise settles during act.
  vi.useRealTimers();
  const ref = React.createRef();

  await act(async () => {
    render(
      <MemoryRouter keyLength={0}>
        <NoTask ref={ref} history={mockHistory} />
      </MemoryRouter>
    );
    await new Promise(resolve => setImmediate(resolve));
  });

  return ref.current;
}

// Render an element returned by an instance render method and return the
// container so callers can both read text content and query the DOM tree
// (e.g. for the CopyToClipboardTableCell title attribute / code text).
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

describe('NoTask page', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('mounts and exposes renderTaskRow', async () => {
    const instance = await renderNoTaskInstance();

    expect(instance).not.toBeNull();
    expect(typeof instance.renderTaskRow).toBe('function');
  });

  it('renders all metadata for a rich record (INV-5)', async () => {
    const instance = await renderNoTaskInstance();
    const container = await renderRow(instance.renderTaskRow(richRecord));
    const text = container.textContent;

    expect(text).toContain(richRecord.taskId);
    expect(text).toContain(richRecord.name);
    expect(text).toContain(richRecord.taskQueueId);
    expect(text).toContain(richRecord.state);
    // INV-5: a "viewed <…>" point-in-time recency label is present.
    expect(text).toMatch(/viewed/);
    // INV-5(b): the state is marked as a point-in-time snapshot via the
    // StatusLabel title attribute.
    const titles = Array.from(container.querySelectorAll('[title]')).map(el =>
      el.getAttribute('title')
    );

    expect(titles).toContain('State recorded at view time; may be stale');
  });

  it('always shows taskId in its own copyable cell even when a name exists (INV-4)', async () => {
    const instance = await renderNoTaskInstance();
    const container = await renderRow(instance.renderTaskRow(richRecord));

    // The ID cell renders the taskId as <code> text (always present) ...
    expect(container.querySelector('code').textContent).toBe(richRecord.taskId);
    // ... and CopyToClipboardTableCell is wired to that ID: the hover tooltip
    // title echoes the taskId being copied (HooksListTable convention).
    const idCellTitle = container
      .querySelector('[title]')
      .getAttribute('title');

    expect(idCellTitle).toContain(richRecord.taskId);
    expect(idCellTitle).toMatch(/Copy/);
  });

  it('renders a legacy ID-only record without throwing and without a viewed label (INV-6)', async () => {
    const instance = await renderNoTaskInstance();
    const container = await renderRow(instance.renderTaskRow(legacyRecord));
    const text = container.textContent;

    expect(text).toContain(legacyRecord.taskId);
    // INV-6: a legacy record has no viewedAt, so no recency label renders.
    expect(text).not.toMatch(/viewed/);
  });

  it('renders the id as a clickable link in the Name cell when name is absent (SPEC-5)', async () => {
    const instance = await renderNoTaskInstance();
    const container = await renderRow(instance.renderTaskRow(legacyRecord));

    // The Name cell falls back to a link to the id instead of a blank cell.
    const link = container.querySelector('a');

    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe(`/tasks/${legacyRecord.taskId}`);
    expect(link.textContent).toBe(legacyRecord.taskId);
  });

  it('renders a back-filled viewedAt:0 record and omits the viewed label (SPEC-1, SPEC-3)', async () => {
    const backFilledRecord = {
      taskId: 'ZERO0000ZERO0000ZERO000',
      // Sentinel 0 is what the v1->v2 migration back-fills on legacy records.
      viewedAt: 0,
    };
    const instance = await renderNoTaskInstance();
    const container = await renderRow(instance.renderTaskRow(backFilledRecord));
    const text = container.textContent;

    // SPEC-1: the record is visible (id rendered), not silently dropped.
    expect(text).toContain(backFilledRecord.taskId);
    // SPEC-3: viewedAt 0 is falsy, so no "viewed" recency claim is shown.
    expect(text).not.toMatch(/viewed/);
    // The id is reachable via a link even without a name (SPEC-5).
    expect(container.querySelector('a').getAttribute('href')).toBe(
      `/tasks/${backFilledRecord.taskId}`
    );
  });

  it('omits the staleness label when viewedAt is absent but other metadata exists (INV-6)', async () => {
    const instance = await renderNoTaskInstance();
    const container = await renderRow(
      instance.renderTaskRow({
        taskId: 'TAIL0012TAIL0012TAIL0012',
        taskQueueId: 'gecko-t/x',
        created: '2022-02-10T10:00:00.000Z',
        // No viewedAt (legacy / pre-v2 shape).
      })
    );

    expect(container.textContent).toContain('gecko-t/x');
    expect(container.textContent).not.toMatch(/viewed/);
  });
});
