import { APIBuilder } from '@taskcluster/lib-api';
import { getProfile } from './profiler/profile.js';
import { readLogFile, fixupLogRows, buildProfileFromLogRows } from './profiler/log-profile.js';

const MAX_TASKS = 20000;
const MAX_PAGES = 200;

const SLUGID_PATTERN = /^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$/;

const builder = new APIBuilder({
  title: 'Web Server Service',
  description: [
    'The web-server service provides a GraphQL gateway to Taskcluster APIs,',
    'as well as profiler endpoints that generate Firefox Profiler–compatible',
    'profiles from task group metadata and task logs.',
  ].join('\n'),
  serviceName: 'web-server',
  apiVersion: 'v1',
  params: {
    taskGroupId: SLUGID_PATTERN,
    taskId: SLUGID_PATTERN,
  },
  context: [
    'clients',
    'rootUrl',
  ],
});

builder.declare({
  method: 'get',
  route: '/task-group/:taskGroupId/profile',
  name: 'taskGroupProfile',
  scopes: null,
  title: 'Task Group Profile',
  category: 'Profiler',
  stability: 'experimental',
  description: [
    'Generate a Firefox Profiler–compatible profile from a task group.',
    'The profile contains scheduling and execution timing for all tasks.',
  ].join('\n'),
}, async function(req, res) {
  const { taskGroupId } = req.params;
  const queue = this.clients({ rootUrl: this.rootUrl }).queue;

  const tasks = [];
  let continuationToken;
  let allResolved = true;

  for (let page = 0; page < MAX_PAGES; page++) {
    const opts = continuationToken ? { continuationToken } : {};
    let result;
    try {
      result = await queue.listTaskGroup(taskGroupId, opts);
    } catch (err) {
      if (err.statusCode === 404) {
        return res.reportError('ResourceNotFound', 'Task group not found', {});
      }
      throw err;
    }

    for (const task of result.tasks) {
      tasks.push(task);
      if (task.status.state === 'running' || task.status.state === 'pending' || task.status.state === 'unscheduled') {
        allResolved = false;
      }
    }

    if (tasks.length > MAX_TASKS) {
      return res.reportError('InputTooLarge', `Task group has more than ${MAX_TASKS} tasks`, {});
    }

    continuationToken = result.continuationToken;
    if (!continuationToken) {break;}
  }

  const taskGroup = {
    taskGroupId,
    schedulerId: tasks[0]?.task?.schedulerId || '',
    expires: tasks[0]?.task?.expires || '',
    tasks,
  };

  const profile = getProfile([taskGroup], this.rootUrl);

  if (allResolved) {
    res.set('Cache-Control', 'public, max-age=86400');
  } else {
    res.set('Cache-Control', 'no-cache');
  }

  return res.status(200).json(profile);
});

builder.declare({
  method: 'get',
  route: '/task/:taskId/profile',
  name: 'taskProfile',
  scopes: null,
  title: 'Task Log Profile',
  category: 'Profiler',
  stability: 'experimental',
  description: [
    'Generate a Firefox Profiler–compatible profile from a task\'s log output.',
    'Parses `public/logs/live.log` (or `live_backing.log`) for timing data.',
  ].join('\n'),
}, async function(req, res) {
  const { taskId } = req.params;
  const queue = this.clients({ rootUrl: this.rootUrl }).queue;

  let task, status;
  try {
    [task, { status }] = await Promise.all([
      queue.task(taskId),
      queue.status(taskId),
    ]);
  } catch (err) {
    if (err.statusCode === 404) {
      return res.reportError('ResourceNotFound', 'Task not found', {});
    }
    throw err;
  }

  let logText;
  for (const artifactName of ['public/logs/live.log', 'public/logs/live_backing.log']) {
    try {
      const artifactUrl = queue.buildUrl(queue.getLatestArtifact, taskId, artifactName);
      const response = await fetch(artifactUrl, { redirect: 'follow' });
      if (response.ok) {
        logText = await response.text();
        break;
      }
    } catch {
      // Try next artifact name
    }
  }

  if (!logText) {
    return res.reportError(
      'ResourceNotFound',
      'Could not fetch task log. The task may not have logs or they may have expired.',
      {},
    );
  }

  const logLines = logText.split('\n');
  const logRows = readLogFile(logLines);
  fixupLogRows(logRows);
  const profile = buildProfileFromLogRows(logRows, task, taskId, this.rootUrl);

  const isResolved = !['running', 'pending', 'unscheduled'].includes(status.state);

  if (isResolved) {
    res.set('Cache-Control', 'public, max-age=86400');
  } else {
    res.set('Cache-Control', 'no-cache');
  }

  return res.status(200).json(profile);
});

builder.declare({
  method: 'get',
  route: '/__heartbeat__',
  name: 'heartbeat',
  scopes: null,
  category: 'Monitoring',
  stability: 'stable',
  title: 'Heartbeat',
  description: [
    'Respond with a service heartbeat.',
    '',
    'This endpoint is used to check on backing services this service',
    'depends on.',
  ].join('\n'),
}, function(_req, res) {
  // TODO: add implementation
  res.reply({});
});

export default builder;
