// @ts-check

/**
 * Categories for task group profiles.
 * Colors: https://github.com/firefox-devtools/profiler/blob/ffe2b6af0fbf4f91a389cc31fd7df776bb198034/src/utils/colors.js#L96
 */
export function getTaskGroupCategories() {
  return [
    { name: 'Other', color: 'grey', subcategories: ['Other'] },
    { name: 'Idle', color: 'transparent', subcategories: ['Other'] },
    { name: 'Layout', color: 'purple', subcategories: ['Other'] },
    { name: 'JavaScript', color: 'yellow', subcategories: ['Other'] },
    { name: 'GC / CC', color: 'orange', subcategories: ['Other'] },
    { name: 'Network', color: 'lightblue', subcategories: ['Other'] },
    { name: 'Graphics', color: 'green', subcategories: ['Other'] },
    { name: 'DOM', color: 'blue', subcategories: ['Other'] },
  ];
}

/**
 * Categories for log profiles.
 */
export function getLogCategories() {
  return [
    { name: 'none', color: 'grey', subcategories: ['Other'] },
    { name: 'fetches', color: 'purple', subcategories: ['Other'] },
    { name: 'vcs', color: 'orange', subcategories: ['Other'] },
    { name: 'setup', color: 'lightblue', subcategories: ['Other'] },
    { name: 'taskcluster', color: 'green', subcategories: ['Other'] },
    { name: 'Task', color: 'lightblue', subcategories: ['Other'] },
    { name: 'Log', color: 'green', subcategories: ['Other'] },
  ];
}

/**
 * Marker schema for tasks in task group profiles.
 */
export function getTaskGroupTaskSchema() {
  return {
    name: 'Task',
    tooltipLabel: '{marker.data.name}',
    tableLabel: '{marker.data.name}',
    chartLabel: '{marker.data.name}',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    data: [
      { key: 'startTime', label: 'Start time', format: 'string' },
      { key: 'name', label: 'Task Name', format: 'string', searchable: true },
      { key: 'taskId', label: 'Task ID', format: 'string' },
      { key: 'owner', label: 'Owner', format: 'string' },
      { key: 'retries', label: 'Retries', format: 'string' },
      { key: 'state', label: 'State', format: 'string' },
      { key: 'reasonCreated', label: 'Reason Created', format: 'string' },
      { key: 'reasonResolved', label: 'Reason Resolved', format: 'string' },
      { key: 'description', label: 'Description', format: 'string' },
      { key: 'taskURL', label: 'Task URL', format: 'url' },
      { key: 'source', label: 'Source URL', format: 'url' },
      { key: 'taskGroup', label: 'Task Group URL', format: 'url' },
      { key: 'liveLog', label: 'Live Log', format: 'url' },
      { key: 'taskProfile', label: 'Task Profile', format: 'url' },
    ],
  };
}

export function getTaskGroupSchema() {
  return {
    name: 'TaskGroup',
    tooltipLabel: '{marker.data.name}',
    tableLabel: '{marker.data.name}',
    chartLabel: '{marker.data.name}',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    data: [
      { key: 'startTime', label: 'Start time', format: 'string' },
      { key: 'name', label: 'Task Group ID', format: 'string', searchable: true },
      { key: 'expires', label: 'Expires', format: 'string' },
      { key: 'tasks', label: 'Tasks', format: 'integer' },
      { key: 'url', label: 'URL', format: 'url' },
    ],
  };
}

/**
 * Marker schema for log rows in task log profiles.
 */
export function getLiveLogRowSchema() {
  return {
    name: 'LiveLogRow',
    tooltipLabel: '{marker.data.message}',
    tableLabel: '{marker.data.message}',
    chartLabel: '{marker.data.message}',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    data: [
      { key: 'startTime', label: 'Start time', format: 'string' },
      { key: 'message', label: 'Log Message', format: 'string', searchable: true },
      { key: 'hour', label: 'Hour', format: 'string' },
      { key: 'date', label: 'Date', format: 'string' },
      { key: 'time', label: 'Time', format: 'time' },
    ],
  };
}

/**
 * Marker schema for the task duration in log profiles.
 */
export function getLogTaskSchema() {
  return {
    name: 'Task',
    tooltipLabel: '{marker.data.taskName}',
    tableLabel: '{marker.data.taskName}',
    chartLabel: '{marker.data.taskName}',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    data: [
      { key: 'startTime', label: 'Start time', format: 'string' },
      { key: 'taskName', label: 'Task Name', format: 'string', searchable: true },
      { key: 'time', label: 'Time', format: 'time' },
      { key: 'taskURL', label: 'Task', format: 'url' },
      { key: 'taskGroupURL', label: 'Task Group', format: 'url' },
      { key: 'taskId', label: 'Task ID', format: 'string' },
      { key: 'taskGroupId', label: 'Task Group ID', format: 'string' },
      { key: 'taskGroupProfile', label: 'Task Group Profile', format: 'url' },
    ],
  };
}
