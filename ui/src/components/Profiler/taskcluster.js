// @ts-check

/**
 * This file contains functions specific to querying and working with Taskcluster APIs
 * TODO - This will most likely be migrated to other internal calls.
 */

/**
 * @typedef {import("./types").TaskAndStatus} TaskAndStatus
 * @typedef {import("./types").TaskGroup} TaskGroup
 * @typedef {import("./types").Task} Task
 * @typedef {import("./types").TimeRange} TimeRange
 */

import { log } from "./utils";

/**
 * @param {string} id
 */
export function isTaskGroupIdValid(id) {
  return id.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * @param {string} server
 * @param {string} taskGroupId
 * @param {(message: string) => void} updateStatusMessage
 * @return {Promise<TaskGroup>}
 */
export async function fetchTaskGroup(server, taskGroupId, updateStatusMessage) {
  const listUrl = `${server}/api/queue/v1/task-group/${taskGroupId}/list`;
  updateStatusMessage(`Fetching Task Group ${taskGroupId}`);
  log("Fetching Task Group:", listUrl);
  const response = await fetch(listUrl);

  if (!response.ok) {
    response.json().then((json) => console.error(json));
    return Promise.reject("Could not fetch task.");
  }

  /** @type {TaskGroup} */
  const taskGroup = await response.json();
  /** @type {TaskGroup} */
  let nextTaskGroup = taskGroup;

  // This API is paginated, continue through it.
  const maxPages = 20;
  for (let page = 0; page < maxPages; page++) {
    if (!nextTaskGroup.continuationToken) {
      // There are no more continuations.
      break;
    }
    updateStatusMessage(
      `Fetching Task Group ${taskGroupId} (page ${page + 2})`
    );
    const continuationUrl =
      listUrl + "?continuationToken=" + nextTaskGroup.continuationToken;
    log("Fetching next tasks for Task Group", continuationUrl);
    const response = await fetch(continuationUrl);
    if (!response.ok) {
      console.error("Failed to fetch a TaskGroup task continuation");
      break;
    }
    nextTaskGroup = await response.json();
    taskGroup.tasks = [...taskGroup.tasks, ...nextTaskGroup.tasks];
  }

  return taskGroup;
}

/**
 * TODO - Determine if fetchDependentTasks should be retained and surfaced in the new Taskcluster UI
 *
 * @param {string[]} taskGroupIds
 * @param {string} server
 * @param {boolean} fetchDependentTasks
 * @param {(message: string) => void} updateStatusMessage
 * @returns {Promise<{ mergedTasks: TaskAndStatus[], taskGroups: TaskGroup[]} | null>}
 */
export async function getTasks(
  taskGroupIds,
  server,
  fetchDependentTasks,
  updateStatusMessage
) {
  if (!taskGroupIds.length) {
    return null;
  }

  // Validate the taskGroupIds
  if (
    taskGroupIds.length &&
    taskGroupIds.some((id) => !isTaskGroupIdValid(id))
  ) {
    const p = document.createElement("p");
    p.innerText =
      "A task group id was not valid, " + JSON.stringify(taskGroupIds);
    document.body.appendChild(p);
    throw new Error(p.innerText);
  }

  log("Using the following taskGroupIds", taskGroupIds);

  /** @type {Array<Promise<TaskGroup>>} */
  const taskGroupPromises = taskGroupIds.map((id) =>
    fetchTaskGroup(server, id, updateStatusMessage)
  );

  let taskGroups = await Promise.all(taskGroupPromises);

  // Find out what task groups we are missing.
  /** @type {Set<string>} */
  const knownTaskIds = new Set();
  /** @type {Set<string>} */
  const dependencies = new Set();
  for (const { tasks } of taskGroups) {
    for (const { task, status } of tasks) {
      knownTaskIds.add(status.taskId);
      for (const id of task.dependencies) {
        dependencies.add(id);
      }
    }
  }

  const taskGroupIdsFetched = new Set(taskGroupIds);
  const taskToGroup = getTaskToGroup();

  let count = 0;
  // TODO - This should be surfaced in the UI.
  const maxCount = 15;
  // Load in the dependency groups.
  for (const taskId of dependencies) {
    if (!fetchDependentTasks) {
      break;
    }
    if (knownTaskIds.has(taskId)) {
      continue;
    }
    // Mark this one as searched.
    knownTaskIds.add(taskId);

    const taskUrl = `${server}/api/queue/v1/task/${taskId}`;
    try {
      let taskGroupId = taskToGroup[taskId];
      if (!taskGroupId) {
        updateStatusMessage("Fetching dependent task groups.");
        log("Fetching Task for its Task Group ID:", taskUrl);
        const response = await fetch(taskUrl);
        const json = await response.json();
        if (!response.ok) {
          console.error(json);
          continue;
        }

        taskGroupId = /** @type {Task} */ (json).taskGroupId;
        setTaskToGroup(taskToGroup, taskId, taskGroupId);
      }
      if (taskGroupIdsFetched.has(taskGroupId)) {
        continue;
      }
      updateStatusMessage("Fetching dependent task groups.");
      taskGroupIdsFetched.add(taskGroupId);
      const listUrl = `${server}/api/queue/v1/task-group/${taskGroupId}/list`;
      log("Fetching TaskGroup", listUrl);
      const response = await fetch(listUrl);
      const json = await response.json();

      if (!response.ok) {
        console.error(json);
        continue;
      }
      /** @type {TaskGroup} */
      const taskGroup = json;

      // Hold on to this new task group.
      taskGroups.push(taskGroup);

      for (const { task, status } of taskGroup.tasks) {
        knownTaskIds.add(status.taskId);
        for (const id of task.dependencies) {
          // Add on the to dependencies. The iterator will continue iterating on all
          // of the newly discovered dependencies.
          dependencies.add(id);
        }
      }

      count++;
      if (count > maxCount) {
        break;
      }
    } catch (error) {
      console.error(error);
    }
  }

  // Do a stable sort based on expires.
  taskGroups.sort(
    (a, b) => Number(new Date(a.expires)) - Number(new Date(b.expires))
  );

  // Get all of the tasks into a flat list.

  /** @type {TaskAndStatus[]} */
  let tasks = [];
  for (const { tasks: tasksList } of taskGroups) {
    for (const task of tasksList) {
      tasks.push(task);
    }
  }

  mutateAndRemoveMissingDependencies(tasks);

  mutateAndRemoveMissingDependencies(tasks);

  return { mergedTasks: tasks, taskGroups };
}

/**
 * TODO - This should probably be removed from the official Taskcluster implementation.
 *
 * From local storage, retain the relationships of task to group. This saves on
 * some API requests which will not change relationships.
 *
 * @returns {Record<string, string>}
 */
function getTaskToGroup() {
  const taskToGroup = localStorage.getItem("taskToGroup");
  if (!taskToGroup) {
    return {};
  }
  try {
    return JSON.parse(taskToGroup);
  } catch (error) {
    return {};
  }
}

/**
 * TODO - This should probably be removed from the official Taskcluster implementation.
 *
 * @param {Record<string, string>} taskToGroup
 * @param {string} taskId
 * @param {string} taskGroupId
 */
function setTaskToGroup(taskToGroup, taskId, taskGroupId) {
  taskToGroup[taskId] = taskGroupId;
  localStorage.setItem("taskToGroup", JSON.stringify(taskToGroup));
}

/**
 * @param {TaskAndStatus[]} tasks
 */
function mutateAndRemoveMissingDependencies(tasks) {
  // Figure out which taskIds are actually present.
  const presentTaskIds = new Set();
  for (const task of tasks) {
    const { taskId } = task.status;
    presentTaskIds.add(taskId);
  }

  // Remove any dependencies that aren't present.
  for (const task of tasks) {
    task.task.dependencies = task.task.dependencies.filter((id) =>
      presentTaskIds.has(id)
    );
  }
}

/**
 * @param {TaskGroup[]} taskGroups
 * @param {(task: TaskAndStatus) => boolean} filterTask
 * @returns {TimeRange[]}
 */
export function getTaskGroupTimeRanges(taskGroups, filterTask = () => true) {
  return taskGroups.map((taskGroup) => {
    /** @type {null | number} */
    let start = null;
    /** @type {null | number} */
    let end = null;
    for (const taskAndStatus of taskGroup.tasks) {
      const { runs } = taskAndStatus.status;
      if (runs && filterTask(taskAndStatus)) {
        for (const run of runs) {
          // Attempt to parse a Date. The results will be NaN on failure.
          const startedMS = new Date(
            run.started ?? run.resolved ?? ""
          ).valueOf();
          const resolvedMS = new Date(run.resolved ?? "").valueOf();

          if (!Number.isNaN(startedMS)) {
            if (start === null) {
              start = startedMS;
            } else {
              start = Math.min(start, startedMS);
            }
          }
          if (!Number.isNaN(resolvedMS)) {
            if (end === null) {
              end = resolvedMS;
            } else {
              end = Math.max(end, resolvedMS);
            }
          }
        }
      }
    }
    return { start, end };
  });
}
