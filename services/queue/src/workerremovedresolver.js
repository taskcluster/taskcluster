import assert from 'assert';
import { consume } from '@taskcluster/lib-pulse';
import { Task } from './data.js';
import { splitTaskQueueId } from './utils.js';

/**
 * Resolves tasks claimed by a worker when that worker is reported stopped
 * or removed by worker-manager via `workerStopped` or `workerRemoved`
 * Pulse events.
 *
 * This prevents the ~20-minute wait for claim expiry by immediately resolving
 * claimed tasks as `exception/worker-shutdown` and scheduling retries.
 *
 * Both events are subscribed to because `workerStopped` fires earlier but
 * `workerRemoved` is the terminal state and may fire without `workerStopped`
 * in some cases. All operations are idempotent, so receiving both events
 * for the same worker is safe.
 */
class WorkerRemovedResolver {
  constructor(options) {
    assert(options, 'options must be given');
    assert(options.db, 'options must include db');
    assert(options.queueService, 'Expected a queueService instance');
    assert(options.dependencyTracker, 'Expected a DependencyTracker instance');
    assert(options.publisher, 'Expected a publisher');
    assert(options.pulseClient, 'Expected a pulseClient');
    assert(options.workerManagerEvents, 'Expected workerManagerEvents');
    assert(options.monitor !== null, 'options.monitor required!');

    this.db = options.db;
    this.queueService = options.queueService;
    this.dependencyTracker = options.dependencyTracker;
    this.publisher = options.publisher;
    this.pulseClient = options.pulseClient;
    this.workerManagerEvents = options.workerManagerEvents;
    this.monitor = options.monitor;
    this.pq = null;
  }

  async start() {
    this.pq = await consume({
      client: this.pulseClient,
      bindings: [
        this.workerManagerEvents.workerStopped(),
        this.workerManagerEvents.workerRemoved(),
      ],
      queueName: 'queue/worker-removed-resolver',
    },
    this.monitor.timedHandler('worker-removed', this.handleWorkerRemoved.bind(this)),
    );
  }

  async terminate() {
    if (this.pq) {
      await this.pq.stop();
      this.pq = null;
    }
  }

  async handleWorkerRemoved(message) {
    const { workerPoolId, workerGroup, workerId, reason } = message.payload;

    const claimedTasks = await this.db.fns.get_claimed_tasks_by_worker(
      workerPoolId, workerGroup, workerId,
    );

    for (const { task_id: taskId, run_id: runId } of claimedTasks) {
      await this.resolveTask(taskId, runId, workerPoolId, workerGroup, workerId, reason);
    }
  }

  async resolveTask(taskId, runId, workerPoolId, workerGroup, workerId, removalReason) {
    const task = await Task.get(this.db, taskId);

    if (!task) {
      return;
    }

    // resolve as exception/worker-shutdown with retry
    task.updateStatusWith(
      await this.db.fns.resolve_task(taskId, runId, 'exception', 'worker-shutdown', 'retry'),
    );

    // we no longer need existing claimed queue message
    // because we just resolved the task, so remove it to
    // prevent it from being processed by the claim resolver
    await this.db.fns.queue_claimed_task_resolved(taskId, runId);

    const run = task.runs[runId];

    // If run wasn't resolved to exception/worker-shutdown, it was already
    // resolved by the worker or another mechanism — nothing to do
    if (!run ||
        task.runs.length - 1 > runId + 1 ||
        run.state !== 'exception' ||
        run.reasonResolved !== 'worker-shutdown') {
      return;
    }

    this.monitor.log.taskResolvedByWorkerRemoved({
      taskId, runId, workerPoolId, workerGroup, workerId, reason: removalReason || 'unknown',
    });

    const status = task.status();

    await this.publisher.taskException({
      status,
      runId,
      task: { tags: task.tags || {} },
      workerGroup: run.workerGroup,
      workerId: run.workerId,
    }, task.routes);
    this.monitor.log.taskException({ taskId, runId });

    const metricLabels = splitTaskQueueId(task.taskQueueId);
    this.monitor.metric.exceptionTasks(1, {
      ...metricLabels,
      reasonResolved: run.reasonResolved,
    });

    // If a retry run was created, publish pending message
    const newRun = task.runs[runId + 1];
    if (newRun &&
        task.runs.length - 1 === runId + 1 &&
        newRun.state === 'pending' &&
        newRun.reasonCreated === 'retry') {
      await Promise.all([
        this.queueService.putPendingMessage(task, runId + 1),
        this.publisher.taskPending({
          status,
          runId: runId + 1,
          task: { tags: task.tags || {} },
        }, task.routes),
      ]);
      this.monitor.log.taskPending({ taskId, runId: runId + 1 });
    } else {
      await this.dependencyTracker.resolveTask(
        taskId, task.taskGroupId, task.schedulerId, 'exception',
      );
    }
  }
}

export default WorkerRemovedResolver;
