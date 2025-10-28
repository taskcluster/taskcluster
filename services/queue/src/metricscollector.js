import assert from 'assert';
import Iterate from '@taskcluster/lib-iterate';
import { TaskQueue } from '../../worker-manager/src/queue-data.js';
import { splitTaskQueueId } from './utils.js';

/**
 * Responsible for collecting and publishing worker-related metrics
 * periodically. This service runs as a background process and
 * gathers metrics about task queues, workers states, and tasks.
 * The metrics are exposed via Prometheus endpoint through the
 * MonitorManager.
 */
class WorkerMetricsCollector {
  /**
   * Create WorkerMetricsCollector instance.
   *
   * @param {Object} options - Configuration options for the collector
   * @param {import('@taskcluster/lib-postgres').Database} options.db - Database instance
   * @param {import('./queueservice.js').QueueService} options.queueService - Queue Service
   * @param {import('@taskcluster/lib-monitor').Monitor} options.monitor - Base monitor instance
   * @param {number} options.pollingDelay - Number of milliseconds to sleep between polling
   * @param {string} options.ownName - Name to identify the service with
   */
  constructor(options) {
    assert(options, 'options must be given');
    assert(options.db, 'options must include db');
    assert(options.queueService, 'options.queueService required!');
    assert(options.monitor, 'options.monitor required!');
    assert(options.ownName, 'Must provide a name');
    assert(typeof options.pollingDelay === 'number',
      'Expected pollingDelay to be a number');

    this.db = options.db;
    this.queueService = options.queueService;
    this.monitor = options.monitor;
    this.pollingDelay = options.pollingDelay;

    // if prometheus isn't configured,
    // this collection of metrics would be useless and waste of resources
    if (!this.monitor.manager?._prometheus?.isEnabled) {
      throw new Error('Prometheus is not configured, metrics collector will not run');
    }

    this.iterator = new Iterate({
      name: options.ownName,
      maxFailures: 10,
      waitTime: this.pollingDelay,
      monitor: this.monitor,
      maxIterationTime: 60 * 1000,
      handler: async () => {
        await this.collectMetrics();
      },
    });

    this.iterator.on('error', () => {
      this.monitor.alert('iteration failed repeatedly; terminating process');
      process.exit(1);
    });
  }

  async start() {
    return this.iterator.start();
  }

  terminate() {
    return this.iterator.stop();
  }

  async collectMetrics() {
    /** @type {Record<string, {
      task_queue_id: string,
      pending_count: number,
      claimed_count: number,
      worker_count: number,
      quarantined_count: number,
      }>} */
    const tqStats = {};
    const taskQueues = await TaskQueue.getAllTaskQueues(this.db, null);

    for (const tq of taskQueues) {
      tqStats[tq.taskQueueId] = {
        task_queue_id: tq.taskQueueId,
        pending_count: 0,
        claimed_count: 0,
        worker_count: 0,
        quarantined_count: 0,
      };
    }

    const workerStats = await this.db.fns.queue_worker_stats();
    for (const stat of workerStats) {
      tqStats[stat.task_queue_id] = {
        ...tqStats[stat.task_queue_id],
        ...stat,
      };
    }

    for (const stats of Object.values(tqStats)) {
      const labels = splitTaskQueueId(stats.task_queue_id);

      this.monitor.metric.pendingTasks(stats.pending_count, labels);
      this.monitor.metric.claimedTasks(stats.claimed_count, labels);
      this.monitor.metric.workersTotal(stats.worker_count, labels);
      this.monitor.metric.quarantinedWorkers(stats.quarantined_count, labels);
      this.monitor.metric.runningWorkers(stats.claimed_count, labels);
      this.monitor.metric.idleWorkers(
        Math.max(0, stats.worker_count - stats.quarantined_count - stats.claimed_count),
        labels);
    }

    this.monitor.debug(`Collected metrics for ${Object.keys(tqStats).length} task queues`);
  }
}

export default WorkerMetricsCollector;
