import memoize from 'fast-memoize';
import { curry, pipe, map, dropRepeatsWith } from 'ramda';
import { lowerCase } from 'lower-case';

export const taskLastRun = task => {
  const sorted = [...task?.status?.runs].sort((a, b) => b.runId - a.runId);

  if (sorted.length === 0 || !sorted[0].started) {
    return null;
  }

  const latest = sorted[0];

  return {
    from: latest?.started,
    to: latest?.resolved,
  };
};

export const taskRunDurationInMs = run => {
  if (!run || !run.from) {
    return 0;
  }

  const to = run.to ? new Date(run.to) : new Date();
  const from = new Date(run.from);

  return to.getTime() - from.getTime();
};

export const taskRunEarliestStart = task => {
  const started = [...task?.status?.runs]
    .map(run => run.started)
    .filter(item => item)
    .sort((a, b) => a.started - b.started);

  return started.length ? new Date(started[0]).getTime() : new Date().getTime();
};

export const taskRunLatestResolve = task => {
  const resolved = [...task?.status?.runs]
    .map(run => run.resolved && new Date(run.resolved).getTime())
    .filter(item => item)
    .sort((a, b) => b - a);

  return resolved.length ? resolved[0] : new Date().getTime();
};

export const filterTasksByState = curry((filter, tasks) =>
  filter
    ? tasks.filter(({ node: { status: { state } } }) => filter.includes(state))
    : tasks
);
export const filterTasksByName = curry((searchTerm, tasks) =>
  searchTerm
    ? tasks.filter(({ node: { metadata: { name } } }) =>
        (name ? lowerCase(name) : '').includes(searchTerm)
      )
    : tasks
);

export const filterTasks = (tasks, state, searchTerm) =>
  pipe(filterTasksByState(state), filterTasksByName(searchTerm))(tasks);

export const taskIds = map(
  ({
    node: {
      metadata: { name },
      status: { state },
      taskId,
    },
  }) => `${taskId}-${name}-${state}`
);

export const taskDurationIds = map(
  ({ taskId, name, state }) => `${taskId}-${name}-${state}`
);

export const filterTasksWithDuration = memoize(
  (tasks, filter, searchTerm) =>
    filterTasks(tasks, filter, searchTerm)
      .map(({ node }) => ({
        duration: taskRunDurationInMs(taskLastRun(node)),
        minStart: taskRunEarliestStart(node),
        maxResolve: taskRunLatestResolve(node),
        taskId: node?.taskId,
        name: node?.metadata?.name,
        state: node?.status?.state,
      }))
      .filter(({ duration }) => !!duration)
      .sort((a, b) => a.duration - b.duration),
  {
    serializer: ([tasks, filter, searchTerm]) =>
      `${tasks ? taskIds(tasks) : ''}${filter}-${searchTerm}`,
  }
);

// displaying thousands of tasks in graph degrades usability and performance
export const sampleTasks = memoize(
  (tasks, filter, searchTerm, maxTasks) => {
    let sampled = tasks;
    let precision = 10;
    const compareDelta = (a, b) =>
      Math.abs(a.duration - b.duration) < precision;

    while (sampled.length > maxTasks) {
      sampled = dropRepeatsWith(compareDelta, tasks);
      precision *= 2;
    }

    return sampled;
  },
  {
    serializer: ([tasks, filter, searchTerm, maxTasks]) =>
      `${
        tasks ? taskDurationIds(tasks) : ''
      }-${filter}-${searchTerm}-${maxTasks}`,
  }
);

// borrowed from https://stackoverflow.com/questions/48719873/how-to-get-median-and-quartiles-percentiles-of-an-array-in-javascript-or-php
export const quantile = (sorted, q) => {
  if (sorted.length === 0) {
    return 0;
  }

  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;

  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }

  return sorted[base];
};

export const formatTime = ms => {
  if (ms < 0 || ms === -Infinity) {
    return 'n/a';
  }

  const s = Math.floor(ms / 1000);
  const parts = [];
  const hours = Math.floor(s / 3600);

  if (hours > 0) {
    parts.push(hours);
  }

  parts.push(Math.floor((s - hours * 3600) / 60));
  parts.push(s % 60);

  return parts.map(t => String(t).padStart(2, '0')).join(':');
};
