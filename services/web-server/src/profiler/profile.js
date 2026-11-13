// @ts-check
import libUrls from 'taskcluster-lib-urls';
import {
  getConcurrencySchema,
  getSummarySchema,
  getTaskGroupCategories,
  getTaskGroupSchema,
  getTaskGroupTaskSchema,
} from './schemas.js';

export function getEmptyThread() {
  return {
    processType: 'default',
    processName: 'Taskcluster',
    processStartupTime: 0,
    processShutdownTime: null,
    registerTime: 0,
    unregisterTime: null,
    pausedRanges: [],
    name: '',
    isMainThread: false,
    showMarkersInTimeline: true,
    pid: 0,
    tid: 0,
    samples: {
      weightType: 'samples',
      weight: null,
      stack: [],
      time: [],
      length: 0,
    },
    markers: {
      data: [],
      name: [],
      startTime: [],
      endTime: [],
      phase: [],
      category: [],
      length: 0,
    },
    stackTable: { frame: [0], prefix: [null], category: [0], subcategory: [0], length: 1 },
    frameTable: {
      address: [-1],
      inlineDepth: [0],
      category: [null],
      subcategory: [0],
      func: [0],
      nativeSymbol: [null],
      innerWindowID: [0],
      implementation: [null],
      line: [null],
      column: [null],
      length: 1,
    },
    funcTable: {
      isJS: [false],
      relevantForJS: [false],
      name: [0],
      resource: [-1],
      fileName: [null],
      lineNumber: [null],
      columnNumber: [null],
      length: 1,
    },
    resourceTable: { lib: [], name: [], host: [], type: [], length: 0 },
    nativeSymbols: { libIndex: [], address: [], name: [], functionSize: [], length: 0 },
    stringArray: [],
  };
}

export function getEmptyProfile() {
  return {
    meta: {
      interval: 1,
      startTime: 0,
      processType: 0,
      product: 'Taskcluster',
      stackwalk: 0,
      version: 27,
      preprocessedProfileVersion: 47,
      physicalCPUs: 0,
      logicalCPUs: 0,
      symbolicationNotSupported: true,
      usesOnlyOneStackType: true,
      markerSchema: [getTaskGroupTaskSchema(), getTaskGroupSchema(), getSummarySchema(), getConcurrencySchema()],
      categories: getTaskGroupCategories(),
    },
    libs: [],
    threads: [],
    counters: [],
  };
}

export class UniqueStringArray {
  constructor(originalArray = []) {
    this.array = originalArray.slice(0);
    this.stringToIndex = new Map();
    for (let i = 0; i < originalArray.length; i += 1) {
      this.stringToIndex.set(originalArray[i], i);
    }
  }

  getString(index) {
    if (!(index in this.array)) {
      throw new Error(`index ${index} not in UniqueStringArray`);
    }
    return this.array[index];
  }

  hasIndex(i) {
    return i in this.array;
  }

  hasString(s) {
    return this.stringToIndex.has(s);
  }

  indexForString(s) {
    let index = this.stringToIndex.get(s);
    if (index === undefined) {
      index = this.array.length;
      this.stringToIndex.set(s, index);
      this.array.push(s);
    }
    return index;
  }

  serializeToArray() {
    return this.array.slice(0);
  }
}

/**
 * Marker color for a task run, based on its outcome.
 * Must be one of the Firefox Profiler graph colors.
 */
export function getRunColor(run) {
  switch (run.state) {
    case 'completed':
      return 'green';
    case 'failed':
      return 'orange';
    case 'exception':
      return ['canceled', 'superseded'].includes(run.reasonResolved) ? 'grey' : 'red';
    default:
      return 'blue';
  }
}

const toMS = date => (date ? new Date(date).valueOf() : null);

/**
 * Computes how many task runs were running and pending over time.
 *
 * Returns consecutive intervals `{ start, end, running, pending }` (epoch ms)
 * in which both counts stay constant. A run is pending from `scheduled` until
 * `started` (or `resolved`), and running from `started` until `resolved`.
 * Unresolved runs extend to `now`.
 */
export function getConcurrency(tasks, now = Date.now()) {
  const deltas = new Map();
  const add = (time, key, delta) => {
    let entry = deltas.get(time);
    if (!entry) {
      entry = { running: 0, pending: 0 };
      deltas.set(time, entry);
    }
    entry[key] += delta;
  };

  for (const { status } of tasks) {
    for (const run of status.runs ?? []) {
      const scheduled = toMS(run.scheduled);
      const started = toMS(run.started);
      const resolved = toMS(run.resolved);
      if (scheduled !== null) {
        add(scheduled, 'pending', 1);
        add(started ?? resolved ?? now, 'pending', -1);
      }
      if (started !== null) {
        add(started, 'running', 1);
        add(resolved ?? now, 'running', -1);
      }
    }
  }

  const times = [...deltas.keys()].sort((a, b) => a - b);
  const intervals = [];
  let running = 0;
  let pending = 0;
  for (let i = 0; i < times.length - 1; i += 1) {
    const delta = deltas.get(times[i]);
    running += delta.running;
    pending += delta.pending;
    intervals.push({ start: times[i], end: times[i + 1], running, pending });
  }
  return intervals;
}

/**
 * Time span of all runs of the given tasks, from the first scheduled (or
 * started) run to the last resolved run. Unresolved runs extend to `now`.
 * Returns null if no run has any timestamps.
 */
function getRunsSpan(tasks, now) {
  let start = null;
  let end = null;
  for (const { status } of tasks) {
    for (const run of status.runs ?? []) {
      const runStart = toMS(run.scheduled ?? run.started ?? run.resolved);
      if (runStart === null) {
        continue;
      }
      const runEnd = toMS(run.resolved) ?? now;
      start = start === null ? runStart : Math.min(start, runStart);
      end = end === null ? runEnd : Math.max(end, runEnd);
    }
  }
  return start === null ? null : { start, end };
}

// Tasks created more than this far apart belong to separate creation bursts.
const BURST_GAP_MS = 60 * 1000;

/**
 * High-level phases of a task group, for the "Summary" markers. Only uses
 * generic Taskcluster data (task IDs and creation times):
 *
 *  - Decision: the task whose taskId equals the taskGroupId, by convention the
 *    task that created the rest of the group.
 *  - Initial tasks: tasks created before the decision task's first completed
 *    run resolved (or its first resolved run, if none completed). Without a
 *    resolved decision task, the first burst of task creation.
 *  - One marker per later burst of task creation (tasks created less than
 *    BURST_GAP_MS apart), e.g. an action task and the tasks it created.
 *    It is labelled with the name of the first task created in the burst.
 *
 * @param {object} taskGroup
 * @param {number} now - end time for runs that are not resolved yet
 * @returns {Array<{ name: string, start: number, end: number, tasks: number, taskId?: string, color: string }>}
 */
export function getSummaryPhases(taskGroup, now = Date.now()) {
  const phases = [];
  const addPhase = (name, tasks, color, taskId) => {
    const span = getRunsSpan(tasks, now);
    if (span) {
      phases.push({ name, ...span, tasks: tasks.length, ...(taskId ? { taskId } : {}), color });
    }
  };

  const created = ({ task }) => toMS(task.created) ?? -Infinity;
  const byCreated = [...taskGroup.tasks].sort((a, b) => created(a) - created(b));
  const bursts = [];
  for (const t of byCreated) {
    const last = bursts.at(-1)?.at(-1);
    if (!last || created(t) - created(last) > BURST_GAP_MS) {
      bursts.push([]);
    }
    bursts.at(-1).push(t);
  }

  const decision = taskGroup.tasks.find(({ status }) => status.taskId === taskGroup.taskGroupId);
  // The first completed run created the task graph; later reruns of the
  // decision task must not reclassify tasks added in the meantime.
  const decisionRuns = decision?.status.runs ?? [];
  const decisionEnd = toMS(
    (decisionRuns.find(run => run.state === 'completed') ?? decisionRuns.find(run => run.resolved))?.resolved
  );
  const initialEnd = decisionEnd ?? (bursts.length ? created(bursts[0].at(-1)) : Infinity);

  if (decision) {
    addPhase('Decision', [decision], 'purple', decision.status.taskId);
  }
  addPhase(
    'Initial tasks',
    byCreated.filter(t => created(t) <= initialEnd),
    'blue'
  );

  for (const burst of bursts) {
    const tasks = burst.filter(t => created(t) > initialEnd);
    if (tasks.length) {
      const [first] = tasks;
      const name = tasks.length > 1 ? `${first.task.metadata.name} (+${tasks.length - 1})` : first.task.metadata.name;
      addPhase(name, tasks, 'yellow', first.status.taskId);
    }
  }

  return phases;
}

function getTaskGroupTimeRanges(taskGroups) {
  return taskGroups.map(taskGroup => {
    let start = null;
    let end = null;
    // true if any run is still pending or running
    let unresolved = false;
    for (const taskAndStatus of taskGroup.tasks) {
      const { runs } = taskAndStatus.status;
      if (runs) {
        for (const run of runs) {
          const startedMS = new Date(run.scheduled ?? run.started ?? run.resolved ?? '').valueOf();
          const resolvedMS = new Date(run.resolved ?? '').valueOf();
          if (!Number.isNaN(startedMS)) {
            start = start === null ? startedMS : Math.min(start, startedMS);
          }
          if (!Number.isNaN(resolvedMS)) {
            end = end === null ? resolvedMS : Math.max(end, resolvedMS);
          } else {
            unresolved = true;
          }
        }
      }
    }
    return { start, end, unresolved };
  });
}

/**
 * Creates a Firefox Profile from a list of task groups.
 *
 * @param {Array} taskGroups
 * @param {string} rootUrl - The Taskcluster root URL
 * @returns {object} Firefox Profiler profile
 */
export function getProfile(taskGroups, rootUrl) {
  const profile = getEmptyProfile();
  let profileStartTime = Infinity;
  const taskGroupTimeRanges = getTaskGroupTimeRanges(taskGroups);

  for (const { start } of taskGroupTimeRanges) {
    if (start !== null) {
      profileStartTime = Math.min(profileStartTime, start);
    }
  }

  if (profileStartTime === Infinity) {
    profileStartTime = 0;
  }

  {
    const ids = taskGroups.map(tg => tg.taskGroupId).join(', ');
    const date = new Date(profileStartTime).toLocaleDateString();
    profile.meta.product = `Task Group ${ids} - ${date}`;
  }

  profile.meta.startTime = profileStartTime;

  let tid = 0;
  let pid = 0;

  profile.threads = taskGroups.map((taskGroup, i) => {
    const stringArray = new UniqueStringArray();
    const taskGroupTimeRange = taskGroupTimeRanges[i];

    const sortedTasks = taskGroup.tasks.map(task => {
      const { runs } = task.status;
      if (!runs?.length || !runs[0].started) {
        return { task, start: null };
      }
      return { task, start: new Date(runs[0].started).valueOf() };
    });

    sortedTasks.sort((ta, tb) => {
      if (!ta.start) {
        return -1;
      }
      if (!tb.start) {
        return 1;
      }
      return ta.start - tb.start;
    });

    const thread = getEmptyThread();
    thread.isMainThread = true;
    thread.name = taskGroup.taskGroupId;
    thread.tid = tid;
    thread.pid = pid;
    tid += 1;
    pid += 1;
    const { markers } = thread;

    if (taskGroupTimeRange.start !== null) {
      thread.registerTime = taskGroupTimeRange.start - profileStartTime;
    } else {
      thread.registerTime = -1;
      thread.unregisterTime = -1;
    }

    // Keep the thread open while runs are unresolved: their markers extend to now.
    if (taskGroupTimeRange.end !== null && !taskGroupTimeRange.unresolved) {
      thread.unregisterTime = taskGroupTimeRange.end - profileStartTime;
    }

    if (taskGroupTimeRange.start) {
      const runStart = taskGroupTimeRange.start;
      const runEnd = taskGroupTimeRange.end;
      markers.startTime.push(runStart - profileStartTime);
      if (runEnd === null) {
        markers.endTime.push(null);
        markers.phase.push(2);
      } else {
        markers.endTime.push(runEnd - profileStartTime);
        markers.phase.push(1);
      }
      markers.category.push(5);
      markers.name.push(stringArray.indexForString('TaskGroup'));
      markers.data.push({
        type: 'TaskGroup',
        startTime: new Date(runStart).toISOString(),
        name: taskGroup.taskGroupId,
        expires: taskGroup.expires,
        tasks: taskGroup.tasks.length,
        url: libUrls.ui(rootUrl, `/tasks/groups/${taskGroup.taskGroupId}`),
      });
      markers.length += 1;
    }

    const summaryName = stringArray.indexForString('Summary');
    for (const phase of getSummaryPhases(taskGroup)) {
      markers.startTime.push(phase.start - profileStartTime);
      markers.endTime.push(phase.end - profileStartTime);
      markers.phase.push(1);
      markers.category.push(5);
      markers.name.push(summaryName);
      markers.data.push({
        type: 'Summary',
        name: phase.name,
        startTime: new Date(phase.start).toISOString(),
        tasks: phase.tasks,
        color: phase.color,
        ...(phase.taskId ? { taskId: phase.taskId, taskURL: libUrls.ui(rootUrl, `/tasks/${phase.taskId}`) } : {}),
      });
      markers.length += 1;
    }

    if (taskGroupTimeRange.start !== null) {
      for (const { task } of sortedTasks) {
        if (!task.status.runs) {
          continue;
        }
        for (const run of task.status.runs) {
          const runStart = run.started ? new Date(run.started).valueOf() : null;
          let runEnd = run.resolved ? new Date(run.resolved).valueOf() : null;
          if (run.state === 'running' && runEnd === null) {
            runEnd = Date.now();
          }
          if (runStart === null) {
            continue;
          }

          markers.startTime.push(runStart - profileStartTime);
          if (runEnd === null) {
            markers.endTime.push(null);
            markers.phase.push(2);
          } else {
            markers.endTime.push(runEnd - profileStartTime);
            markers.phase.push(1);
          }
          markers.category.push(5);
          const grouping = run.reasonResolved ?? run.state;
          markers.name.push(stringArray.indexForString(run.state === 'completed' ? 'Task' : `Task (${grouping})`));

          const taskName = task.task.metadata.name;
          const { retries } = task.task;
          const { runId } = run;
          const { taskId } = task.status;
          const name =
            run.state === 'completed' && run.runId === 0 && retries > 1
              ? taskName
              : `${taskName} (run ${runId + 1}/${retries})`;

          markers.data.push({
            type: 'Task',
            startTime: new Date(runStart).toISOString(),
            name,
            taskId,
            owner: task.task.metadata.owner,
            description: task.task.metadata.description,
            source: task.task.metadata.source,
            retries: `${runId + 1} / ${retries}`,
            state: run.state,
            reasonCreated: run.reasonCreated,
            reasonResolved: run.reasonResolved,
            taskURL: libUrls.ui(rootUrl, `/tasks/${taskId}/runs/${runId}`),
            taskGroup: libUrls.ui(rootUrl, `/tasks/groups/${task.task.taskGroupId}`),
            liveLog: libUrls.ui(rootUrl, `/tasks/${taskId}/runs/${runId}/logs/live/public/logs/live.log`),
            taskProfile: libUrls.ui(rootUrl, `/tasks/${taskId}/profiler`),
            color: getRunColor(run),
          });
          markers.length += 1;
        }
      }
    }

    const concurrencyName = stringArray.indexForString('Concurrency');
    for (const { start, end, running, pending } of getConcurrency(taskGroup.tasks)) {
      markers.startTime.push(start - profileStartTime);
      markers.endTime.push(end - profileStartTime);
      markers.phase.push(1);
      markers.category.push(0);
      markers.name.push(concurrencyName);
      markers.data.push({ type: 'Concurrency', running, pending });
      markers.length += 1;
    }

    thread.stringArray = stringArray.serializeToArray();
    return thread;
  });

  profile.threads.sort((a, b) => a.registerTime - b.registerTime);
  return profile;
}
