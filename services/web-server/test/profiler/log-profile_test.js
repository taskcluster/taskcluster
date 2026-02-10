import assert from 'assert';
import { readLogFile, fixupLogRows, buildProfileFromLogRows } from '../../src/profiler/log-profile.js';

suite('profiler/log-profile', function() {
  const sampleLogLines = [
    '[taskcluster:info 2024-01-01T10:00:00.000Z] Starting task',
    '[setup:warn 2024-01-01T10:00:01.000Z] Installing dependencies',
    '[vcs:info 2024-01-01T10:00:02.000Z] Cloning repository',
    '',
    '[taskcluster:info 2024-01-01T10:00:05.000Z] Task complete',
  ];

  const mockTask = {
    created: '2024-01-01T09:55:00.000Z',
    taskGroupId: 'group-1',
    metadata: {
      name: 'Build Task',
      description: 'Builds the project',
      owner: 'dev@example.com',
      source: 'https://example.com',
    },
  };

  suite('readLogFile', function() {
    test('parses log lines into structured rows', function() {
      const rows = readLogFile(sampleLogLines);
      assert(rows.length > 0);
      assert.equal(rows[0].component, 'taskcluster');
      assert.equal(rows[0].message, 'Starting task');
      assert(rows[0].time instanceof Date);
    });

    test('assigns "no timestamp" component to lines without timestamps', function() {
      const rows = readLogFile([
        '[taskcluster:info 2024-01-01T10:00:00.000Z] Starting',
        'some plain text line',
      ]);
      assert.equal(rows[1].component, 'no timestamp');
      assert.equal(rows[1].message, 'some plain text line');
    });

    test('skips empty lines', function() {
      const rows = readLogFile([
        '[taskcluster:info 2024-01-01T10:00:00.000Z] Starting',
        '',
        '   ',
        '[taskcluster:info 2024-01-01T10:00:01.000Z] Done',
      ]);
      assert.equal(rows.length, 2);
    });

    test('throws if no timestamps found', function() {
      assert.throws(() => readLogFile(['no timestamps here']), /Could not find a time/);
    });
  });

  suite('buildProfileFromLogRows', function() {
    test('builds a valid profile', function() {
      const logRows = readLogFile(sampleLogLines);
      fixupLogRows(logRows);
      const rootUrl = 'https://tc.example.com';
      const profile = buildProfileFromLogRows(logRows, mockTask, 'task-123', rootUrl);

      assert.equal(profile.meta.version, 27);
      assert(profile.meta.product.includes('Build Task'));
      assert(profile.meta.product.includes('task-123'));
      assert.equal(profile.threads.length, 1);
      assert.equal(profile.threads[0].name, 'Live Log');
    });

    test('creates markers for each log row plus the task duration', function() {
      const logRows = readLogFile(sampleLogLines);
      fixupLogRows(logRows);
      const rootUrl = 'https://tc.example.com';
      const profile = buildProfileFromLogRows(logRows, mockTask, 'task-123', rootUrl);
      const thread = profile.threads[0];

      // 4 log rows (empty lines skipped) + 1 task duration marker
      assert.equal(thread.markers.length, logRows.length + 1);
    });

    test('includes task URLs using rootUrl', function() {
      const logRows = readLogFile(sampleLogLines);
      fixupLogRows(logRows);
      const rootUrl = 'https://tc.example.com';
      const profile = buildProfileFromLogRows(logRows, mockTask, 'task-123', rootUrl);
      const thread = profile.threads[0];
      const taskMarker = thread.markers.data.find(d => d.type === 'Task');

      assert(taskMarker.taskURL.includes('tc.example.com'));
      assert(taskMarker.taskGroupURL.includes('group-1'));
      assert(taskMarker.taskGroupProfile.includes('/profiler'));
    });
  });
});
