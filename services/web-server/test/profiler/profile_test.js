import assert from 'node:assert';
import {
  getProfile,
  getEmptyProfile,
  getEmptyThread,
  getConcurrency,
  getRunColor,
  getSummaryPhases,
  UniqueStringArray,
} from '../../src/profiler/profile.js';

suite('profiler/profile', () => {
  const mockTaskGroup = {
    taskGroupId: 'group-1',
    schedulerId: 'test-scheduler',
    expires: '2025-01-01T00:00:00.000Z',
    tasks: [
      {
        task: {
          metadata: {
            name: 'Build Task',
            description: 'Builds the project',
            owner: 'dev@example.com',
            source: 'https://example.com/source',
          },
          retries: 3,
          taskGroupId: 'group-1',
          dependencies: [],
        },
        status: {
          taskId: 'task-1',
          runs: [
            {
              runId: 0,
              state: 'completed',
              started: '2024-01-01T10:00:00.000Z',
              resolved: '2024-01-01T10:05:00.000Z',
              reasonCreated: 'scheduled',
              reasonResolved: 'completed',
            },
          ],
        },
      },
      {
        task: {
          metadata: {
            name: 'Test Task',
            description: 'Runs tests',
            owner: 'dev@example.com',
            source: 'https://example.com/source',
          },
          retries: 1,
          taskGroupId: 'group-1',
          dependencies: ['task-1'],
        },
        status: {
          taskId: 'task-2',
          runs: [
            {
              runId: 0,
              state: 'completed',
              started: '2024-01-01T10:05:00.000Z',
              resolved: '2024-01-01T10:10:00.000Z',
              reasonCreated: 'scheduled',
              reasonResolved: 'completed',
            },
          ],
        },
      },
    ],
  };

  suite('getProfile', () => {
    test('generates a valid Firefox Profiler profile', () => {
      const rootUrl = 'https://taskcluster.net';
      const profile = getProfile([mockTaskGroup], rootUrl);
      assert.equal(profile.meta.version, 27);
      assert(profile.meta.product.includes('Task Group group-1'));
      assert.equal(profile.meta.symbolicationNotSupported, true);
    });

    test('creates one thread per task group', () => {
      const rootUrl = 'https://taskcluster.net';
      const profile = getProfile([mockTaskGroup], rootUrl);
      assert.equal(profile.threads.length, 1);
      assert.equal(profile.threads[0].name, 'group-1');
    });

    test('creates markers for tasks', () => {
      const rootUrl = 'https://taskcluster.net';
      const profile = getProfile([mockTaskGroup], rootUrl);
      const thread = profile.threads[0];
      assert(thread.markers.length >= 2);
    });

    test('sets correct startTime from earliest run', () => {
      const rootUrl = 'https://taskcluster.net';
      const profile = getProfile([mockTaskGroup], rootUrl);
      const expectedStart = new Date('2024-01-01T10:00:00.000Z').valueOf();
      assert.equal(profile.meta.startTime, expectedStart);
    });

    test('includes task URLs pointing to the deployment', () => {
      const rootUrl = 'https://taskcluster.net';
      const profile = getProfile([mockTaskGroup], rootUrl);
      const thread = profile.threads[0];
      const taskMarkerData = thread.markers.data.find(d => d.type === 'Task' && d.taskId);
      assert(taskMarkerData.taskURL.includes('taskcluster.net'));
    });

    test('includes internal profiler URL for task profiles', () => {
      const rootUrl = 'https://taskcluster.net';
      const profile = getProfile([mockTaskGroup], rootUrl);
      const thread = profile.threads[0];
      const taskMarkerData = thread.markers.data.find(d => d.type === 'Task' && d.taskId);
      assert(taskMarkerData.taskProfile.includes('/profiler'));
    });

    test('marker startTime field is the run start time', () => {
      const profile = getProfile([mockTaskGroup], 'https://taskcluster.net');
      const data = profile.threads[0].markers.data;
      assert.equal(data.find(d => d.taskId === 'task-2').startTime, '2024-01-01T10:05:00.000Z');
      assert.equal(data.find(d => d.type === 'TaskGroup').startTime, '2024-01-01T10:00:00.000Z');
    });

    test('colors task markers by run result', () => {
      const profile = getProfile([mockTaskGroup], 'https://taskcluster.net');
      const taskSchema = profile.meta.markerSchema.find(s => s.name === 'Task');
      assert.equal(taskSchema.colorField, 'color');
      assert.equal(profile.threads[0].markers.data.find(d => d.taskId === 'task-1').color, 'green');

      assert.equal(getRunColor({ state: 'failed' }), 'orange');
      assert.equal(getRunColor({ state: 'exception', reasonResolved: 'canceled' }), 'grey');
      assert.equal(getRunColor({ state: 'exception', reasonResolved: 'claim-expired' }), 'red');
      assert.equal(getRunColor({ state: 'running' }), 'blue');
    });

    test('computes running and pending task counts over time', () => {
      const t = ms => new Date(ms).toISOString();
      const run = (scheduled, started, resolved) => ({
        scheduled: t(scheduled),
        started: started === null ? undefined : t(started),
        resolved: resolved === null ? undefined : t(resolved),
      });
      const tasks = [
        { status: { runs: [run(0, 10, 30)] } },
        { status: { runs: [run(5, 20, 40)] } },
        { status: { runs: [run(35, null, null)] } }, // still pending
      ];
      assert.deepEqual(getConcurrency(tasks, 50), [
        { start: 0, end: 5, running: 0, pending: 1 },
        { start: 5, end: 10, running: 0, pending: 2 },
        { start: 10, end: 20, running: 1, pending: 1 },
        { start: 20, end: 30, running: 2, pending: 0 },
        { start: 30, end: 35, running: 1, pending: 0 },
        { start: 35, end: 40, running: 1, pending: 1 },
        { start: 40, end: 50, running: 0, pending: 1 },
      ]);

      const profile = getProfile([mockTaskGroup], 'https://taskcluster.net');
      assert(profile.meta.markerSchema.find(s => s.name === 'Concurrency').graphs.length > 0);
      assert(profile.threads[0].markers.data.some(d => d.type === 'Concurrency' && d.running === 1));
    });

    test('profile range covers pending and running runs', () => {
      const group = {
        ...mockTaskGroup,
        tasks: [
          {
            task: mockTaskGroup.tasks[0].task,
            status: { taskId: 'task-1', runs: [{ runId: 0, state: 'pending', scheduled: '2024-01-01T09:55:00.000Z' }] },
          },
        ],
      };
      const profile = getProfile([group], 'https://taskcluster.net');
      assert.equal(profile.meta.startTime, new Date('2024-01-01T09:55:00.000Z').valueOf());
      assert.equal(profile.threads[0].registerTime, 0);
      assert.equal(profile.threads[0].unregisterTime, null);
      assert.equal(profile.threads[0].markers.data.find(d => d.type === 'Concurrency').pending, 1);
    });

    test('summarizes decision, initial tasks and later creation bursts', () => {
      const t = sec => new Date(sec * 1000).toISOString();
      const task = (taskId, name, created, scheduled, resolved) => ({
        task: { metadata: { name }, created: t(created) },
        status: { taskId, runs: [{ scheduled: t(scheduled), started: t(scheduled), resolved: t(resolved) }] },
      });
      const tasks = [
        task('decision', 'Decision Task', 0, 0, 10),
        task('build', 'build', 5, 10, 30),
        task('action', 'Action: Retrigger', 100, 100, 130),
        task('retriggered', 'build', 120, 130, 200),
        task('manual', 'test', 400, 400, 450),
      ];
      const summarize = group =>
        getSummaryPhases(group).map(({ name, start, end, tasks }) => ({
          name,
          start: start / 1000,
          end: end / 1000,
          tasks,
        }));

      assert.deepEqual(summarize({ taskGroupId: 'decision', tasks }), [
        { name: 'Decision', start: 0, end: 10, tasks: 1 },
        { name: 'Initial tasks', start: 0, end: 30, tasks: 2 },
        { name: 'Action: Retrigger (+1)', start: 100, end: 200, tasks: 2 },
        { name: 'test', start: 400, end: 450, tasks: 1 },
      ]);
      // rerunning the decision task later does not reclassify earlier bursts
      const rerun = {
        ...tasks[0],
        status: {
          taskId: 'decision',
          runs: [
            { state: 'completed', scheduled: t(0), started: t(0), resolved: t(10) },
            { state: 'completed', scheduled: t(200), started: t(200), resolved: t(210) },
          ],
        },
      };
      assert.deepEqual(
        summarize({ taskGroupId: 'decision', tasks: [rerun, ...tasks.slice(1)] }).map(p => p.name),
        ['Decision', 'Initial tasks', 'Action: Retrigger (+1)', 'test']
      );
      // without a decision task, the first creation burst is the initial set
      assert.deepEqual(
        summarize({ taskGroupId: 'no-such-task', tasks }).map(p => p.name),
        ['Initial tasks', 'Action: Retrigger (+1)', 'test']
      );

      const profile = getProfile([{ taskGroupId: 'decision', tasks }], 'https://taskcluster.net');
      const taskSchema = profile.meta.markerSchema.find(s => s.name === 'Task');
      assert(!taskSchema.display.includes('timeline-overview'));
      assert.equal(profile.threads[0].markers.data.filter(d => d.type === 'Summary').length, 4);
    });

    test('handles task groups with no runs', () => {
      const emptyGroup = {
        ...mockTaskGroup,
        tasks: [
          {
            task: mockTaskGroup.tasks[0].task,
            status: { taskId: 'task-no-runs', runs: [] },
          },
        ],
      };
      const rootUrl = 'https://taskcluster.net';
      const profile = getProfile([emptyGroup], rootUrl);
      assert.equal(profile.threads.length, 1);
      assert.equal(profile.meta.startTime, 0);
    });

    test('handles multiple task groups', () => {
      const secondGroup = { ...mockTaskGroup, taskGroupId: 'group-2' };
      const rootUrl = 'https://taskcluster.net';
      const profile = getProfile([mockTaskGroup, secondGroup], rootUrl);
      assert.equal(profile.threads.length, 2);
    });
  });

  suite('getEmptyProfile', () => {
    test('has required meta fields', () => {
      const profile = getEmptyProfile();
      assert.equal(profile.meta.version, 27);
      assert.equal(profile.meta.preprocessedProfileVersion, 47);
      assert(profile.meta.categories);
      assert(profile.meta.markerSchema);
      assert.deepEqual(profile.threads, []);
    });
  });

  suite('getEmptyThread', () => {
    test('has required marker fields', () => {
      const thread = getEmptyThread();
      assert.deepEqual(thread.markers.data, []);
      assert.deepEqual(thread.markers.name, []);
      assert.deepEqual(thread.markers.startTime, []);
      assert.equal(thread.markers.length, 0);
      assert.deepEqual(thread.stringArray, []);
    });
  });

  suite('UniqueStringArray', () => {
    test('returns consistent indices for the same string', () => {
      const arr = new UniqueStringArray();
      assert.equal(arr.indexForString('hello'), arr.indexForString('hello'));
    });

    test('returns different indices for different strings', () => {
      const arr = new UniqueStringArray();
      assert.notEqual(arr.indexForString('hello'), arr.indexForString('world'));
    });

    test('retrieves strings by index', () => {
      const arr = new UniqueStringArray();
      const idx = arr.indexForString('test');
      assert.equal(arr.getString(idx), 'test');
    });

    test('serializes to array', () => {
      const arr = new UniqueStringArray();
      arr.indexForString('a');
      arr.indexForString('b');
      arr.indexForString('c');
      assert.deepEqual(arr.serializeToArray(), ['a', 'b', 'c']);
    });
  });
});
