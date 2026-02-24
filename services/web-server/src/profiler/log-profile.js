// @ts-check
import libUrls from 'taskcluster-lib-urls';
import { getEmptyProfile, getEmptyThread, UniqueStringArray } from './profile.js';
import { getLiveLogRowSchema, getLogTaskSchema, getLogCategories } from './schemas.js';

const LOG_PATTERN = /^\s*\[(?<component>\w+)(:(?<logLevel>\w+))?\s*(?<time>[\d\-T:.Z+]+)\]\s*(?<message>.*)/;
const TIMESTAMP_CLEANUP = /^\s*\[[\d\-T:.Z+ ]+\]\s*/;
const NEWLINE = 10;

/**
 * Async generator that yields lines from a readable stream.
 * Buffers partial lines across chunks. Calls onBytes(n) for each chunk
 * to allow callers to track total bytes read.
 *
 * @param {ReadableStream|AsyncIterable} stream
 * @param {function} [onBytes] - called with byte count of each chunk
 */
export async function* lineIterator(stream, onBytes) {
  const decoder = new TextDecoder('utf-8');
  let leftover = new Uint8Array(0);

  for await (const chunk of stream) {
    if (onBytes) {onBytes(chunk.byteLength);}

    // Combine ONLY the leftover bit from the previous chunk
    let combined = leftover.length > 0
      ? Buffer.concat([leftover, chunk])
      : chunk;

    let start = 0;
    while (true) {
      const idx = combined.indexOf(NEWLINE, start);
      if (idx === -1) {break;}

      yield decoder.decode(combined.subarray(start, idx));
      start = idx + 1;
    }

    // Slice the remainder for the next chunk
    leftover = combined.subarray(start);
  }

  if (leftover.length > 0) {
    yield decoder.decode(leftover);
  }
}

export class StreamingProfileBuilder {
  constructor(task, taskId, rootUrl) {
    this.task = task;
    this.taskId = taskId;
    this.rootUrl = rootUrl;

    this.profile = getEmptyProfile();
    this.profile.meta.markerSchema = [getLiveLogRowSchema(), getLogTaskSchema()];
    this.profile.meta.categories = getLogCategories();

    const date = new Date(task.created).toLocaleDateString();
    this.profile.meta.product = `${task.metadata.name} ${taskId} - ${date}`;

    this.thread = getEmptyThread();
    this.thread.name = 'Live Log';
    this.thread.isMainThread = true;
    this.profile.threads.push(this.thread);

    this.stringArray = new UniqueStringArray();
    this.markers = this.thread.markers;

    this.categoryIndexDict = {};
    this.profile.meta.categories.forEach((category, index) => {
      this.categoryIndexDict[category.name] = index;
    });

    this.profileStartTime = null;
    this.lastTime = null;
    this.bufferedLines = [];

    // Reserve slot 0 for task duration marker — patched in finalize()
    this.markers.startTime.push(0);
    this.markers.endTime.push(0);
    this.markers.phase.push(1);
    this.markers.category.push(this.categoryIndexDict.Task ?? 0);
    this.markers.name.push(this.stringArray.indexForString(task.metadata.name));
    this.markers.data.push(null); // placeholder, filled in finalize()
    this.markers.length += 1;
  }

  addLine(line) {
    if (!line.trim()) { return; }

    const match = line.match(LOG_PATTERN);
    if (match && match.groups) {
      const time = new Date(match.groups.time);
      const component = match.groups.component;
      const message = match.groups.message.replace(TIMESTAMP_CLEANUP, '');

      if (this.profileStartTime === null) {
        this.profileStartTime = Number(time);
        // Flush any buffered lines that came before the first timestamp
        for (const buffered of this.bufferedLines) {
          this._pushMarker('no timestamp', this.profileStartTime, buffered);
        }
        this.bufferedLines = null;
      }

      this.lastTime = Number(time);
      this._pushMarker(component, this.lastTime, message);
    } else if (this.profileStartTime === null) {
      // Buffer lines until we find a timestamp
      this.bufferedLines.push(line);
    } else {
      this._pushMarker('no timestamp', this.lastTime, line);
    }
  }

  _pushMarker(component, timeMs, message) {
    this.markers.startTime.push(timeMs - this.profileStartTime);
    this.markers.endTime.push(null);
    this.markers.phase.push(0);
    this.markers.category.push(this.categoryIndexDict[component] ?? this.categoryIndexDict.Log ?? 0);
    this.markers.name.push(this.stringArray.indexForString(component));
    this.markers.data.push({
      type: 'LiveLogRow',
      message: this.stringArray.indexForString(message),
    });
    this.markers.length += 1;
  }

  finalize() {
    if (this.profileStartTime === null) {
      throw new Error('Could not find a time in the log rows');
    }

    const lastTime = this.lastTime || this.profileStartTime;
    this.profile.meta.startTime = this.profileStartTime;

    // Patch the task duration marker (slot 0)
    this.markers.endTime[0] = lastTime - this.profileStartTime;
    this.markers.data[0] = {
      type: 'Task',
      name: 'Task',
      taskName: this.task.metadata.name,
      taskId: this.taskId,
      taskGroupId: this.task.taskGroupId,
      taskGroupURL: libUrls.ui(this.rootUrl, `/tasks/groups/${this.task.taskGroupId}`),
      taskURL: libUrls.ui(this.rootUrl, `/tasks/${this.taskId}`),
      taskGroupProfile: libUrls.ui(this.rootUrl, `/tasks/groups/${this.task.taskGroupId}/profiler`),
    };

    this.thread.stringArray = this.stringArray.serializeToArray();
    return this.profile;
  }
}
