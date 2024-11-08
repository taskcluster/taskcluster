// @ts-check

/**
 * This file contains the main logic code for converting Taskcluster data structures
 * into Firefox Profiler data structures.
 */

import {
  asAny,
  encodeUintArrayForUrlComponent,
  getServer,
  log,
} from "./utils.js";
import {
  getEmptyProfile,
  getEmptyThread,
  UniqueStringArray,
  getProfile,
} from "./profiler.js";
import { getTasks } from "./taskcluster.js";

/**
 * @typedef {import("./types").Task} Task
 * @typedef {import('./profiler.js').Profile} Profile
 */

// TODO - Figure out how to configure preferences in the new Taskcluster UI.
log("Override the profiler origin with window.profilerOrigin");
asAny(window).profilerOrigin = "https://profiler.firefox.com";

/**
 * @typedef {Object} LogRow
 *
 * @prop {string} component
 * @prop {Date} time
 * @prop {string} message
 */

/**
 * Parses log lines and returns an array of LogRow objects.
 *
 * @param {string[]} lines - The log lines to parse.
 * @returns {LogRow[]} The parsed log rows.
 */
function readLogFile(lines) {
  const logPattern =
    /^\s*\[(?<component>\w+)(:(?<logLevel>\w+))?\s*(?<time>[\d\-T:.Z]+)\]\s*(?<message>.*)/;
  // ^\s*                                                                                     Skip any beginning whitespace.
  //     \[                                                            \]                     "[taskcluster:warn 2024-05-20T14:40:11.353Z]"
  //       (?<component>\w+)                                                                  Capture the component name, here "taskcluster"
  //                        (:(?<logLevel>\w+))?                                              An optional log level, like "warn"
  //                                            \s*                                           Ignore whitespace
  //                                               (?<time>[\d\-T:.Z]+)                       Capture the timestamp
  //                                                                     \s*                  Ignore whitespace
  //                                                                        (?<message>.*)    Capture the rest as the message

  /** @type {LogRow[]} */
  const logRows = [];

  // Find the first time.
  let time;
  for (const line of lines) {
    const match = line.match(logPattern);
    if (match && match.groups) {
      time = new Date(match.groups.time);
      break;
    }
  }
  if (!time) {
    throw new Error("Could not find a time in the log rows");
  }

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const match = line.match(logPattern);
    if (match && match.groups) {
      time = new Date(match.groups.time);
      logRows.push({
        component: match.groups.component,
        time,
        message: match.groups.message,
      });
    } else {
      logRows.push({
        component: "no timestamp",
        time,
        message: line,
      });
    }
  }

  return logRows;
}

/**
 * Removes any extra datetimes from the log messages.
 *
 * @param {LogRow[]} logRows - The log rows to process.
 * @returns {LogRow[]} The modified log rows.
 */
function fixupLogRows(logRows) {
  //  Remove any extra datetimes.
  //  "[2024-05-20 15:04:26] Ep. 1 : Up. 12 : Sen. 24,225 : ..."
  //   ^^^^^^^^^^^^^^^^^^^^^

  const regex = /^\s*\[[\d\-T:.Z]\]\s*/;

  for (const logRow of logRows) {
    // Remove the date-time part from the log string
    logRow.message = logRow.message.replace(regex, "");
  }

  return logRows;
}

/**
 * Colors are listed here:
 * https://github.com/firefox-devtools/profiler/blob/ffe2b6af0fbf4f91a389cc31fd7df776bb198034/src/utils/colors.js#L96
 */
function getCategories() {
  return [
    {
      name: "none",
      color: "grey",
      subcategories: ["Other"],
    },
    {
      name: "fetches",
      color: "purple",
      subcategories: ["Other"],
    },
    {
      name: "vcs",
      color: "orange",
      subcategories: ["Other"],
    },
    {
      name: "setup",
      color: "lightblue",
      subcategories: ["Other"],
    },
    {
      name: "taskcluster",
      color: "green",
      subcategories: ["Other"],
    },
    {
      name: "Task",
      color: "lightblue",
      subcategories: ["Other"],
    },
    {
      name: "Log",
      color: "green",
      subcategories: ["Other"],
    },
  ];
}

/**
 * This is documented in the profiler:
 * Markers: https://github.com/firefox-devtools/profiler/src/types/markers.js
 * Schema: https://github.com/firefox-devtools/profiler/blob/df32b2d320cb4c9bc7b4ee988a291afa33daff71/src/types/markers.js#L100
 */
function getLiveLogRowSchema() {
  return {
    name: "LiveLogRow",
    tooltipLabel: "{marker.data.message}",
    tableLabel: "{marker.data.message}",
    chartLabel: "{marker.data.message}",
    display: ["marker-chart", "marker-table", "timeline-overview"],
    data: [
      {
        key: "startTime",
        label: "Start time",
        format: "string",
      },
      {
        key: "message",
        label: "Log Message",
        format: "string",
        searchable: true,
      },
      {
        key: "hour",
        label: "Hour",
        format: "string",
      },
      {
        key: "date",
        label: "Date",
        format: "string",
      },
      {
        key: "time",
        label: "Time",
        format: "time",
      },
    ],
  };
}

function getTaskSchema() {
  return {
    name: "Task",
    tooltipLabel: "{marker.data.taskName}",
    tableLabel: "{marker.data.taskName}",
    chartLabel: "{marker.data.taskName}",
    display: ["marker-chart", "marker-table", "timeline-overview"],
    data: [
      {
        key: "startTime",
        label: "Start time",
        format: "string",
      },
      {
        key: "taskName",
        label: "Task Name",
        format: "string",
        searchable: true,
      },
      {
        key: "time",
        label: "Time",
        format: "time",
      },
      {
        key: "taskURL",
        label: "Task",
        format: "url",
      },
      {
        key: "taskGroupURL",
        label: "Task Group",
        format: "url",
      },

      {
        key: "taskId",
        label: "Task ID",
        format: "string",
      },
      {
        key: "taskGroupId",
        label: "Task Group ID",
        format: "string",
      },
      {
        key: "taskGroupProfile",
        label: "Task Group Profile",
        format: "url",
      },
    ],
  };
}

/**
 * Builds a profile from the provided log rows.
 *
 * @param {LogRow[]} logRows - The log rows to process.
 * @param {Task} task
 * @param {string} taskId
 * @returns {Profile} The generated profile.
 */
function buildProfileFromLogRows(logRows, task, taskId) {
  const profile = getEmptyProfile();
  profile.meta.markerSchema = [getLiveLogRowSchema(), getTaskSchema()];
  profile.meta.categories = getCategories();

  const date = new Date(task.created).toLocaleDateString();

  profile.meta.product = `${task.metadata.name} ${taskId} - ${date}`;

  // Compute and save the profile start time.
  let profileStartTime = Infinity;
  let lastLogRowTime = 0;
  for (const logRow of logRows) {
    if (logRow.time) {
      profileStartTime = Math.min(profileStartTime, Number(logRow.time));
      lastLogRowTime = Math.max(lastLogRowTime, Number(logRow.time));
    }
  }
  profile.meta.startTime = profileStartTime;

  // Create the thread that we'll attach the markers to.
  const thread = getEmptyThread();
  thread.name = "Live Log";
  profile.threads.push(thread);
  thread.isMainThread = true;
  const markers = thread.markers;

  // Map a category name to its index.

  /** @type {Record<string, number>} */
  const categoryIndexDict = {};
  profile.meta.categories.forEach((category, index) => {
    categoryIndexDict[category.name] = index;
  });

  const stringArray = new UniqueStringArray();

  {
    // Add the task.
    const durationMarker = 1;
    markers.startTime.push(0);
    markers.endTime.push(lastLogRowTime - profileStartTime);
    markers.phase.push(durationMarker);

    markers.category.push(categoryIndexDict["Task"] ?? 0);
    markers.name.push(stringArray.indexForString(task.metadata.name));

    markers.data.push({
      type: "Task",
      name: "Task",
      taskName: task.metadata.name,
      taskGroupURL: `${getServer()}/tasks/groups/${task.taskGroupId}`,
      taskURL: `${getServer()}/tasks/${taskId}`,
      // TODO - This needs a new special URL.
      taskGroupProfile: `https://gregtatum.github.io/taskcluster-tools/src/taskprofiler/?taskGroupId=${task.taskGroupId}`,
    });
    markers.length += 1;
  }

  for (const logRow of logRows) {
    const runStart = Number(logRow.time);
    const instantMarker = 0;
    markers.startTime.push(runStart - profileStartTime);
    markers.endTime.push(null);
    markers.phase.push(instantMarker);
    markers.category.push(categoryIndexDict["Log"] || 0);
    markers.name.push(stringArray.indexForString(logRow.component));

    markers.data.push({
      type: "LiveLogRow",
      name: "LiveLogRow",
      message: logRow.message,
      hour: logRow.time.toISOString().substr(11, 8),
      date: logRow.time.toISOString().substr(0, 10),
    });
    markers.length += 1;
  }

  thread.stringArray = stringArray.serializeToArray();

  return profile;
}

/**
 * Fetches log rows from the specified TaskCluster URL.
 *
 * @param {string} taskId - The Task ID to fetch logs for.
 * @param {Task} task
 * @returns {Promise<Profile>} A promise that resolves to an array of LogRow objects.
 */
async function fetchLogsAndBuildProfile(taskId, task) {
  const url = `https://firefoxci.taskcluster-artifacts.net/${taskId}/0/public/logs/live_backing.log`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const logText = await response.text();
  const logLines = logText.split("\n");
  log("Log text", { logText });

  const logRows = readLogFile(logLines);
  fixupLogRows(logRows);

  log("Log rows", { logRows });
  return buildProfileFromLogRows(logRows, task, taskId);
}

/**
 * @param {string} message
 */
function updateStatusMessage(message) {
  // TODO - Needs a Taskcluster UI implementation
}

/**
 * Uses window.postMessage to inject the profile into profiler.firefox.com.
 *
 * See: https://github.com/firefox-devtools/profiler/blob/e51f64485f85091e5c3f5fc692e69068b3324fbd/docs-developer/loading-in-profiles.md#from-a-windowpostmessage
 *
 * @param {Profile} profile
 * @param {string} params
 */
async function injectProfile(profile, params = "") {
  const { profilerOrigin } = asAny(window);

  const profilerURL = profilerOrigin + "/from-post-message/" + params;

  const profilerWindow = window.open(profilerURL, "_blank");

  if (!profilerWindow) {
    console.error("Failed to open the new window.");
    return;
  }

  // Wait for the profiler page to respond that it is ready.
  let isReady = false;

  /**
   * @param {MessageEvent} event
   */
  const listener = ({ data }) => {
    if (data?.name === "ready:response") {
      log("The profiler is ready. Injecting the profile.");
      isReady = true;
      const message = {
        name: "inject-profile",
        profile,
      };
      profilerWindow.postMessage(message, profilerOrigin);
      window.removeEventListener("message", listener);
    }
  };

  window.addEventListener("message", listener);
  while (!isReady) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    profilerWindow.postMessage({ name: "ready:request" }, profilerOrigin);
  }

  window.removeEventListener("message", listener);
}

/**
 * @param {string} taskId
 */
async function getProfileFromTaskId(taskId) {
  updateStatusMessage("Fetching the logs…");
  try {
    const taskUrl = `${getServer()}/api/queue/v1/task/${taskId}`;
    const response = await fetch(taskUrl);
    /** @type {Task} */
    const task = await response.json();
    if (!response.ok) {
      console.error(task);
      return;
    }
    log("Task", task);

    const profile = await fetchLogsAndBuildProfile(taskId, task);

    log("Profile", profile);

    await injectProfile(profile);
    updateStatusMessage(`Profile for task "${taskId}" was opened.`);
  } catch (error) {
    console.error(error);
    updateStatusMessage("There was an error, see the console for more details");
  }
}

/**
 * @param {string} taskGroupId
 */
async function getProfileFromTaskGroup(taskGroupId) {
  try {
    updateStatusMessage("Loading tasks");

    // TODO - This may need UI surfacing.
    const fetchDependentTasks = false;

    const result = await getTasks(
      [taskGroupId],
      getServer(),
      /* fetch dep tasks */ fetchDependentTasks,
      updateStatusMessage
    );

    log("Fetched TaskGroups", result);

    if (!result) {
      // TODO - If there is no result, report this in the UI.
      return;
    }

    const { taskGroups } = result;
    const profile = getProfile(taskGroups, new URL(getServer()));

    const threadSelection = encodeUintArrayForUrlComponent(
      profile.threads.map((_thread, i) => i)
    );

    // By default select all the threads.
    const params = `?thread=${threadSelection}`;
    await injectProfile(profile, params);
    updateStatusMessage(`Profile for task group "${taskGroupId}" was opened.`);
  } catch (error) {
    console.error(error);
    updateStatusMessage("There was an error, see the console for more details");
  }
}
