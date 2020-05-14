require('source-map-support/register');

// If we passed --require async-dump command line option, set up a timer
// to dump ongoing async IO operations every 5 seconds
if (global.asyncDump) {
  console.log('Installing async hook...');
  setInterval(global.asyncDump, 5000);
}

const reportHostMetrics = require('../lib/stats/host_metrics');
const fs = require('fs');
const os = require('os');
const program = require('commander');
const taskcluster = require('taskcluster-client');
const createLogger = require('../lib/log').createLogger;
const Debug = require('debug');
const _ = require('lodash');
const {defaultMonitorManager} = require('../lib/monitor');
const Runtime = require('../lib/runtime');
const TaskListener = require('../lib/task_listener');
const ShutdownManager = require('../lib/shutdown_manager');
const GarbageCollector = require('../lib/gc');
const VolumeCache = require('../lib/volume_cache');
const ImageManager = require('../lib/docker/image_manager');
const typedEnvConfig = require('typed-env-config');
const SchemaSet = require('../lib/validate');
const { spawn } = require('child_process');
const { version } = require('../../package.json');

// Available target configurations.
let allowedHosts = ['aws', 'test', 'packet', 'worker-runner'];
let debug = Debug('docker-worker:bin:worker');

// All overridable configuration options from the CLI.
let overridableFields = [
  'capacity',
  'workerId',
  'workerType',
  'workerGroup',
  'workerNodeType',
  'provisionerId',
];

function verifySSLCertificates(config) {
  try {
    fs.statSync(config.ssl.certificate);
    fs.statSync(config.ssl.key);
  }
  catch (error) {
    config.log(
      '[alert-operator] ssl certificate error',
      {
        error: `Could not locate SSL files. Error code: ${error.code}`,
      },
    );
    // If certificates can't be found for some reason, set capacity to 0 so
    // we do not continue to respawn workers that could probably have the same
    // issue
    config.capacity = 0;
  }
}

// Terrible wrapper around program.option.
function o() {
  program.option.apply(program, arguments);
}

// Usage.
program.usage(
  '[options] <profile>',
);
program.version(version);

// CLI Options.
o('--host <type>',
  'configure worker for host type [' + allowedHosts.join(', ') + ']');
o('-c, --capacity <value>', 'capacity override value');
o('--provisioner-id <provisioner-id>', 'override provisioner id configuration');
o('--worker-type <worker-type>', 'override workerType configuration');
o('--worker-group <worker-group>', 'override workerGroup');
o('--worker-id <worker-id>', 'override the worker id');
o('--worker-node-type <worker-node-type>', 'override the worker node type');

program.parse(process.argv);

// Main.
(async () => {
  let profile = program.args[0];

  if (!profile) {
    console.error('Config profile must be specified: test, production');
    return process.exit(1);
  }

  let config = typedEnvConfig({
    files: [`${__dirname}/../../config.yml`],
    profile: profile,
    env: process.env,
  });

  // Use a target specific configuration helper if available.
  let host;
  if (program.host) {
    if (allowedHosts.indexOf(program.host) === -1) {
      console.log(
        '%s is not an allowed host use one of: %s',
        program.host,
        allowedHosts.join(', '),
      );
      return process.exit(1);
    }

    host = require('../lib/host/' + program.host);

    if (host.setup) {
      host.setup();
    }

    // execute the configuration helper and merge the results
    let targetConfig = await host.configure();
    config = _.defaultsDeep(targetConfig, config);
  }

  process.on('unhandledRejection', async (reason, p) => {
    console.error(`Unhandled rejection at ${p}.\n${reason.stack || reason}`);
    if (host && host.shutdown) {
      await host.shutdown();
    } else {
      spawn('shutdown', ['-h', 'now', `docker-worker shutdown due to unhandled rejection ${reason}`]);
    }
  });

  // process CLI specific overrides
  overridableFields.forEach(function(field) {
    if (!(field in program)) {return;}
    config[field] = program[field];
  });

  taskcluster.config({
    rootUrl: config.rootUrl,
    credentials: config.taskcluster,
  });

  // If restrict CPU is set override capacity (as long as capacity is > 0)
  // Capacity could be set to zero by the host configuration if the credentials and
  // other necessary information could not be retrieved from the meta/user/secret-data
  // endpoints.  We set capacity to zero so no tasks are claimed and wait out the billng
  // cycle.  This should really only happen if the worker has respawned unintentionally
  if (config.restrictCPU && config.capacity > 0) {
    // One capacity per core...
    config.capacity = os.cpus().length;
    config.deviceManagement.cpu.enabled = true;
    debug('running in restrict CPU mode...');
  }

  // Initialize the classes and objects with core functionality used by higher
  // level docker-worker components.
  config.docker = require('../lib/docker')();

  let monitor = await defaultMonitorManager.configure({
    serviceName: config.monitorProject || 'docker-worker',
  }).setup({
    processName: 'docker-worker',
    fake: profile === 'test',
  });

  config.workerTypeMonitor = monitor.childMonitor(`${config.provisionerId}.${config.workerType}`);
  config.monitor = config.workerTypeMonitor.childMonitor(`${config.workerNodeType.replace('.', '')}`);

  config.monitor.measure('workerStart', Date.now() - os.uptime());
  config.monitor.count('workerStart');

  config.queue = new taskcluster.Queue({
    rootUrl: config.rootUrl,
    credentials: config.taskcluster,
  });

  const schemaset = new SchemaSet({
    serviceName: 'docker-worker',
    publish: false,
  });
  config.validator = await schemaset.validator(config.rootUrl);

  setInterval(
    reportHostMetrics.bind(this, {
      stats: config.monitor,
      dockerVolume: config.dockerVolume,
    }),
    config.metricsCollection.hostMetricsInterval,
  );

  config.log = createLogger({
    source: 'top', // top level logger details...
    provisionerId: config.provisionerId,
    workerId: config.workerId,
    workerGroup: config.workerGroup,
    workerType: config.workerType,
    workerNodeType: config.workerNodeType,
  });

  let gcConfig = config.garbageCollection;
  gcConfig.capacity = config.capacity,
  gcConfig.diskspaceThreshold = config.capacityManagement.diskspaceThreshold;
  gcConfig.dockerVolume = config.dockerVolume;
  gcConfig.docker = config.docker;
  gcConfig.log = config.log;
  gcConfig.monitor = config.monitor;

  config.gc = new GarbageCollector(gcConfig);

  config.volumeCache = new VolumeCache(config);

  config.gc.on('gc:container:removed', function (container) {
    container.caches.forEach(async (cacheKey) => {
      await config.volumeCache.release(cacheKey);
    });
  });

  config.gc.addManager(config.volumeCache);

  let runtime = new Runtime(config);

  runtime.hostManager = host;
  runtime.imageManager = new ImageManager(runtime);

  let shutdownManager;

  // Billing cycle logic is host specific so we cannot handle shutdowns without
  // both the host and the configuration to shutdown.
  if (host && config.shutdown) {
    runtime.log('handle shutdowns');
    shutdownManager = new ShutdownManager(host, runtime);
    // Recommended by AWS to query every 5 seconds.  Termination window is 2 minutes
    // so at the very least should have 1m55s to cleanly shutdown.
    await shutdownManager.scheduleTerminationPoll();
    runtime.shutdownManager = shutdownManager;
  }

  if (runtime.logging.secureLiveLogging) {
    verifySSLCertificates(runtime);
  }

  // Build the listener and connect to the queue.
  let taskListener = new TaskListener(runtime);
  runtime.gc.taskListener = taskListener;
  shutdownManager.observe(taskListener);

  await taskListener.connect();

  runtime.log('start');

  // Aliveness check logic... Mostly useful in combination with a log inactivity
  // check like papertrail/logentries/loggly have.
  async function alivenessCheck() {
    let uptime = host.billingCycleUptime();
    runtime.log('aliveness check', {
      alive: true,
      uptime: uptime,
      interval: config.alivenessCheckInterval,
    });
    setTimeout(alivenessCheck, config.alivenessCheckInterval);
  }

  // Always run the initial aliveness check during startup.
  await alivenessCheck();

  // Test only logic for clean shutdowns (this ensures our tests actually go
  // through the entire steps of running a task).
  if (config.testMode) {
    // Gracefullyish close the connection.
    process.once('message', async (msg) => {
      if (msg.type !== 'halt') {return;}
      // Halt will wait for the worker to be in an idle state then pause all
      // incoming messages and close the connection...
      async function halt() {
        taskListener.pause();
        await taskListener.close();
        await runtime.purgeCacheListener.close();
      }
      if (taskListener.isIdle()) {return await halt;}
      taskListener.once('idle', halt);
    });
  }
})().catch(err => {
  console.error(err.stack);
  process.exit(1);
});
