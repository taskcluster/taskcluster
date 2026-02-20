import assert from 'assert';
import { Readable } from 'stream';
import { StreamingProfileBuilder, lineIterator } from '../../src/profiler/log-profile.js';

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

suite('profiler/log-profile', function() {

  suite('lineIterator', function() {
    test('yields complete lines from a stream', async function() {
      const input = 'line one\nline two\nline three\n';
      const stream = Readable.from([Buffer.from(input)]);
      const lines = [];
      for await (const line of lineIterator(stream)) {
        lines.push(line);
      }
      assert.deepEqual(lines, ['line one', 'line two', 'line three']);
    });

    test('handles lines split across chunks', async function() {
      const stream = Readable.from([
        Buffer.from('partial li'),
        Buffer.from('ne one\nline t'),
        Buffer.from('wo\n'),
      ]);
      const lines = [];
      for await (const line of lineIterator(stream)) {
        lines.push(line);
      }
      assert.deepEqual(lines, ['partial line one', 'line two']);
    });

    test('yields final line without trailing newline', async function() {
      const stream = Readable.from([Buffer.from('line one\nno newline at end')]);
      const lines = [];
      for await (const line of lineIterator(stream)) {
        lines.push(line);
      }
      assert.deepEqual(lines, ['line one', 'no newline at end']);
    });

    test('tracks bytes read via callback', async function() {
      const stream = Readable.from([Buffer.from('hello\nworld\n')]);
      let totalBytes = 0;
      for await (const _ of lineIterator(stream, (n) => { totalBytes += n; })) {
        // consume
      }
      assert.equal(totalBytes, 12);
    });
  });

  suite('StreamingProfileBuilder', function() {
    test('builds a valid profile from lines', function() {
      const builder = new StreamingProfileBuilder(mockTask, 'task-123', 'https://tc.example.com');
      builder.addLine('[taskcluster:info 2024-01-01T10:00:00.000Z] Starting task');
      builder.addLine('[setup:warn 2024-01-01T10:00:01.000Z] Installing dependencies');
      builder.addLine('[taskcluster:info 2024-01-01T10:00:05.000Z] Task complete');
      const profile = builder.finalize();

      assert.equal(profile.meta.version, 27);
      assert(profile.meta.product.includes('Build Task'));
      assert.equal(profile.threads.length, 1);
      assert.equal(profile.threads[0].name, 'Live Log');
      // 3 log rows + 1 task duration marker
      assert.equal(profile.threads[0].markers.length, 4);
    });

    test('skips empty lines', function() {
      const builder = new StreamingProfileBuilder(mockTask, 'task-123', 'https://tc.example.com');
      builder.addLine('[taskcluster:info 2024-01-01T10:00:00.000Z] Start');
      builder.addLine('');
      builder.addLine('   ');
      builder.addLine('[taskcluster:info 2024-01-01T10:00:01.000Z] End');
      const profile = builder.finalize();

      // 2 log rows + 1 task duration marker
      assert.equal(profile.threads[0].markers.length, 3);
    });

    test('uses logLevel as marker name', function() {
      const builder = new StreamingProfileBuilder(mockTask, 'task-123', 'https://tc.example.com');
      builder.addLine('[taskcluster:info 2024-01-01T10:00:00.000Z] Hello');
      builder.addLine('[setup:warn 2024-01-01T10:00:01.000Z] Warning');
      const profile = builder.finalize();
      const thread = profile.threads[0];

      const name1 = thread.stringArray[thread.markers.name[1]];
      const name2 = thread.stringArray[thread.markers.name[2]];
      assert.equal(name1, 'info');
      assert.equal(name2, 'warn');
    });

    test('stores messages as unique-string indices', function() {
      const builder = new StreamingProfileBuilder(mockTask, 'task-123', 'https://tc.example.com');
      builder.addLine('[taskcluster:info 2024-01-01T10:00:00.000Z] Hello world');
      const profile = builder.finalize();
      const thread = profile.threads[0];
      const data = thread.markers.data[1];

      assert.equal(typeof data.message, 'number');
      assert.equal(thread.stringArray[data.message], 'Hello world');
    });

    test('deduplicates repeated messages in stringArray', function() {
      const builder = new StreamingProfileBuilder(mockTask, 'task-123', 'https://tc.example.com');
      builder.addLine('[taskcluster:info 2024-01-01T10:00:00.000Z] same message');
      builder.addLine('[taskcluster:info 2024-01-01T10:00:01.000Z] same message');
      builder.addLine('[taskcluster:info 2024-01-01T10:00:02.000Z] different');
      const profile = builder.finalize();
      const thread = profile.threads[0];

      // markers at index 1 and 2 should have same message index
      assert.equal(thread.markers.data[1].message, thread.markers.data[2].message);
      // marker at index 3 should have different index
      assert.notEqual(thread.markers.data[1].message, thread.markers.data[3].message);
    });

    test('strips duplicate timestamps from messages', function() {
      const builder = new StreamingProfileBuilder(mockTask, 'task-123', 'https://tc.example.com');
      builder.addLine('[task 2024-01-01T10:00:00.000Z] [2024-01-01T10:00:00.000Z] actual message');
      const profile = builder.finalize();
      const thread = profile.threads[0];
      const msgIndex = thread.markers.data[1].message;

      assert.equal(thread.stringArray[msgIndex], 'actual message');
    });

    test('handles lines without timestamps', function() {
      const builder = new StreamingProfileBuilder(mockTask, 'task-123', 'https://tc.example.com');
      builder.addLine('[taskcluster:info 2024-01-01T10:00:00.000Z] Start');
      builder.addLine('plain text line');
      const profile = builder.finalize();
      const thread = profile.threads[0];

      assert.equal(thread.markers.length, 3);
      const name = thread.stringArray[thread.markers.name[2]];
      assert.equal(name, 'LOG');
    });

    test('throws if no timestamps found', function() {
      const builder = new StreamingProfileBuilder(mockTask, 'task-123', 'https://tc.example.com');
      builder.addLine('no timestamps here');
      assert.throws(() => builder.finalize(), /Could not find a time/);
    });

    test('includes task duration marker with URLs', function() {
      const builder = new StreamingProfileBuilder(mockTask, 'task-123', 'https://tc.example.com');
      builder.addLine('[taskcluster:info 2024-01-01T10:00:00.000Z] Start');
      builder.addLine('[taskcluster:info 2024-01-01T10:00:05.000Z] End');
      const profile = builder.finalize();
      const thread = profile.threads[0];
      const taskMarker = thread.markers.data[0];

      assert.equal(taskMarker.type, 'Task');
      assert(taskMarker.taskURL.includes('tc.example.com'));
      assert(taskMarker.taskGroupURL.includes('group-1'));

      // Duration should be 5000ms
      assert.equal(thread.markers.endTime[0], 5000);
    });
  });
});
