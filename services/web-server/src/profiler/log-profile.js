// @ts-check
import libUrls from 'taskcluster-lib-urls';
import { getEmptyProfile, getEmptyThread, UniqueStringArray } from './profile.js';
import { getLiveLogRowSchema, getLogTaskSchema, getLogCategories } from './schemas.js';

export function readLogFile(lines) {
  const logPattern = /^\s*\[(?<component>\w+)(:(?<logLevel>\w+))?\s*(?<time>[\d\-T:.Z]+)\]\s*(?<message>.*)/;
  const logRows = [];
  let time;

  for (const line of lines) {
    const match = line.match(logPattern);
    if (match && match.groups) {
      time = new Date(match.groups.time);
      break;
    }
  }

  if (!time) {
    throw new Error('Could not find a time in the log rows');
  }

  for (const line of lines) {
    if (!line.trim()) {continue;}
    const match = line.match(logPattern);
    if (match && match.groups) {
      time = new Date(match.groups.time);
      logRows.push({ component: match.groups.component, time, message: match.groups.message });
    } else {
      logRows.push({ component: 'no timestamp', time, message: line });
    }
  }

  return logRows;
}

export function fixupLogRows(logRows) {
  const regex = /^\s*\[[\d\-T:.Z ]+\]\s*/;
  for (const logRow of logRows) {
    logRow.message = logRow.message.replace(regex, '');
  }
  return logRows;
}

/**
 * @param {Array} logRows - Parsed log rows from readLogFile
 * @param {object} task - Task definition object
 * @param {string} taskId
 * @param {string} rootUrl - Taskcluster root URL
 * @returns {object} Firefox Profiler profile
 */
export function buildProfileFromLogRows(logRows, task, taskId, rootUrl) {
  const profile = getEmptyProfile();
  profile.meta.markerSchema = [getLiveLogRowSchema(), getLogTaskSchema()];
  profile.meta.categories = getLogCategories();

  const date = new Date(task.created).toLocaleDateString();
  profile.meta.product = `${task.metadata.name} ${taskId} - ${date}`;

  let profileStartTime = Infinity;
  let lastLogRowTime = 0;
  for (const logRow of logRows) {
    if (logRow.time) {
      profileStartTime = Math.min(profileStartTime, Number(logRow.time));
      lastLogRowTime = Math.max(lastLogRowTime, Number(logRow.time));
    }
  }
  profile.meta.startTime = profileStartTime;

  const thread = getEmptyThread();
  thread.name = 'Live Log';
  profile.threads.push(thread);
  thread.isMainThread = true;
  const { markers } = thread;

  const categoryIndexDict = {};
  profile.meta.categories.forEach((category, index) => {
    categoryIndexDict[category.name] = index;
  });

  const stringArray = new UniqueStringArray();

  // Add the task duration marker
  markers.startTime.push(0);
  markers.endTime.push(lastLogRowTime - profileStartTime);
  markers.phase.push(1);
  markers.category.push(categoryIndexDict.Task ?? 0);
  markers.name.push(stringArray.indexForString(task.metadata.name));
  markers.data.push({
    type: 'Task',
    name: 'Task',
    taskName: task.metadata.name,
    taskId,
    taskGroupId: task.taskGroupId,
    taskGroupURL: libUrls.ui(rootUrl, `/tasks/groups/${task.taskGroupId}`),
    taskURL: libUrls.ui(rootUrl, `/tasks/${taskId}`),
    taskGroupProfile: libUrls.ui(rootUrl, `/tasks/groups/${task.taskGroupId}/profiler`),
  });
  markers.length += 1;

  // Add log row markers
  for (const logRow of logRows) {
    const runStart = Number(logRow.time);
    markers.startTime.push(runStart - profileStartTime);
    markers.endTime.push(null);
    markers.phase.push(0);
    markers.category.push(categoryIndexDict.Log || 0);
    markers.name.push(stringArray.indexForString(logRow.component));
    markers.data.push({
      type: 'LiveLogRow',
      name: 'LiveLogRow',
      message: logRow.message,
      hour: logRow.time.toISOString().substr(11, 8),
      date: logRow.time.toISOString().substr(0, 10),
    });
    markers.length += 1;
  }

  thread.stringArray = stringArray.serializeToArray();
  return profile;
}
