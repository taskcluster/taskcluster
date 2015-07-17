import base from 'taskcluster-base';

const BASE_WORKER_SCHEMA = {
    workerId: base.stats.types.String,
    workerType: base.stats.types.String,
    workerGroup: base.stats.types.String,
    instanceType: base.stats.types.String,
    provisionerId: base.stats.types.String,
    capacity: base.stats.types.Number
};

export const workerStart = new base.stats.Series({
  name: 'worker_start',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    // Time the worker started
    value: base.stats.types.Number
  })
});

export const workerShutdown = new base.stats.Series({
  name: 'worker_shutdown',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    // Time the worker shutdown
    value: base.stats.types.Number
  })
});

export const workerUptime = new base.stats.Series({
  name: 'worker_uptime',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    // Time in MS that the system has been up
    value: base.stats.types.Number
  })
});

export const workerMemory = new base.stats.Series({
  name: 'worker_memory',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    // free/total in bytes
    free: base.stats.types.Number,
    total: base.stats.types.Number,
    used: base.stats.types.Number
  })
});

export const workerHD = new base.stats.Series({
  name: 'worker_hd',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    // free/used/total in bytes
    free: base.stats.types.Number,
    used: base.stats.types.Number,
    total: base.stats.types.Number
  })
});

export const workerCPULoad = new base.stats.Series({
  name: 'worker_cpu_load',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    // cpu load expressed as a percentage
    value: base.stats.types.Number
  })
});

export const workerSpotTermination = new base.stats.Series({
  name: 'worker_shutdown',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    // Time node termination event emitted
    value: base.stats.types.Number
  })
});

export const cacheMount = new base.stats.Series({
  name: 'volume_cache_mount',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    // Cache name
    name: base.stats.types.String,
    miss: base.stats.types.String
  })
});

export const abortTask = new base.stats.Series({
  name: 'tasks_abort',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    value: base.stats.types.Number
  })
});

export const timeToFirstClaim = new base.stats.Series({
  name: 'tasks_first_claim',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    // Time in ms from when the task was created to when the first worker claimed
    // it
    value: base.stats.types.Number
  })
});

export const runTimeExceeded = new base.stats.Series({
  name: 'tasks_run_time_exceeded',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    value: base.stats.types.Number
  })
});

export const taskRunTime = new base.stats.Series({
  name: 'tasks_runtime',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    duration: base.stats.types.Number
  })
});

export const taskFeature = new base.stats.Series({
  name: 'task_feature',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    // Feature name
    value: base.stats.types.String
  })
});

export const taskImage = new base.stats.Series({
  name: 'task_image',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    // Image name
    value: base.stats.types.String
  })
});

export const devicePhone = new base.stats.Series({
  name: 'task_device_phone',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    type: base.stats.types.String,
    sims: base.stats.types.String
  })
});

export const stateChange = new base.stats.Series({
  name: 'state_change',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    state: base.stats.types.String,
    duration: base.stats.types.Number
  })
});

export const capacityOverTime = new base.stats.Series({
  name: 'capacity_over_time',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    duration: base.stats.types.Number,
    idleCapacity: base.stats.types.Number,
    runningTasks: base.stats.types.Number,
    totalCapacity: base.stats.types.Number
  })
});

