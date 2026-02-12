import assert from 'assert';
import {
  getProfile,
  getEmptyProfile,
  getEmptyThread,
  UniqueStringArray,
} from '../../src/profiler/profile.js';

suite('profiler/profile', function() {
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

  suite('getProfile', function() {
    test('generates a valid Firefox Profiler profile', function() {
      const rootUrl = 'https://taskcluster.net';
      const profile = getProfile([mockTaskGroup], rootUrl);
      assert.equal(profile.meta.version, 27);
      assert(profile.meta.product.includes('Task Group group-1'));
      assert.equal(profile.meta.symbolicationNotSupported, true);
    });

    test('creates one thread per task group', function() {
      const rootUrl = 'https://taskcluster.net';
      const profile = getProfile([mockTaskGroup], rootUrl);
      assert.equal(profile.threads.length, 1);
      assert.equal(profile.threads[0].name, 'group-1');
    });

    test('creates markers for tasks', function() {
      const rootUrl = 'https://taskcluster.net';
      const profile = getProfile([mockTaskGroup], rootUrl);
      const thread = profile.threads[0];
      assert(thread.markers.length >= 2);
    });

    test('sets correct startTime from earliest run', function() {
      const rootUrl = 'https://taskcluster.net';
      const profile = getProfile([mockTaskGroup], rootUrl);
      const expectedStart = new Date('2024-01-01T10:00:00.000Z').valueOf();
      assert.equal(profile.meta.startTime, expectedStart);
    });

    test('includes task URLs pointing to the deployment', function() {
      const rootUrl = 'https://taskcluster.net';
      const profile = getProfile([mockTaskGroup], rootUrl);
      const thread = profile.threads[0];
      const taskMarkerData = thread.markers.data.find(
        d => d.type === 'Task' && d.taskId,
      );
      assert(taskMarkerData.taskURL.includes('taskcluster.net'));
    });

    test('includes internal profiler URL for task profiles', function() {
      const rootUrl = 'https://taskcluster.net';
      const profile = getProfile([mockTaskGroup], rootUrl);
      const thread = profile.threads[0];
      const taskMarkerData = thread.markers.data.find(
        d => d.type === 'Task' && d.taskId,
      );
      assert(taskMarkerData.taskProfile.includes('/profiler'));
    });

    test('handles task groups with no runs', function() {
      const emptyGroup = {
        ...mockTaskGroup,
        tasks: [{
          task: mockTaskGroup.tasks[0].task,
          status: { taskId: 'task-no-runs', runs: [] },
        }],
      };
      const rootUrl = 'https://taskcluster.net';
      const profile = getProfile([emptyGroup], rootUrl);
      assert.equal(profile.threads.length, 1);
      assert.equal(profile.meta.startTime, 0);
    });

    test('handles multiple task groups', function() {
      const secondGroup = { ...mockTaskGroup, taskGroupId: 'group-2' };
      const rootUrl = 'https://taskcluster.net';
      const profile = getProfile([mockTaskGroup, secondGroup], rootUrl);
      assert.equal(profile.threads.length, 2);
    });
  });

  suite('getEmptyProfile', function() {
    test('has required meta fields', function() {
      const profile = getEmptyProfile();
      assert.equal(profile.meta.version, 27);
      assert.equal(profile.meta.preprocessedProfileVersion, 47);
      assert(profile.meta.categories);
      assert(profile.meta.markerSchema);
      assert.deepEqual(profile.threads, []);
    });
  });

  suite('getEmptyThread', function() {
    test('has required marker fields', function() {
      const thread = getEmptyThread();
      assert.deepEqual(thread.markers.data, []);
      assert.deepEqual(thread.markers.name, []);
      assert.deepEqual(thread.markers.startTime, []);
      assert.equal(thread.markers.length, 0);
      assert.deepEqual(thread.stringArray, []);
    });
  });

  suite('UniqueStringArray', function() {
    test('returns consistent indices for the same string', function() {
      const arr = new UniqueStringArray();
      assert.equal(arr.indexForString('hello'), arr.indexForString('hello'));
    });

    test('returns different indices for different strings', function() {
      const arr = new UniqueStringArray();
      assert.notEqual(arr.indexForString('hello'), arr.indexForString('world'));
    });

    test('retrieves strings by index', function() {
      const arr = new UniqueStringArray();
      const idx = arr.indexForString('test');
      assert.equal(arr.getString(idx), 'test');
    });

    test('serializes to array', function() {
      const arr = new UniqueStringArray();
      arr.indexForString('a');
      arr.indexForString('b');
      arr.indexForString('c');
      assert.deepEqual(arr.serializeToArray(), ['a', 'b', 'c']);
    });
  });
});
