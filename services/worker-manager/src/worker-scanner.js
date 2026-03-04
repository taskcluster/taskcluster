import _ from 'lodash';
import Iterate from '@taskcluster/lib-iterate';
import taskcluster from '@taskcluster/client';
import { paginatedIterator } from '@taskcluster/lib-postgres';
import { Worker, WorkerPool } from './data.js';

/**
 * Make sure that we visit each worker relatively frequently to update its state
 * to accurately inform provisioning logic.
 */
export class WorkerScanner {
  constructor({
    ownName,
    WorkerPool,
    providers,
    monitor,
    iterateConf = {},
    db,
    providersFilter = {},
    estimator,
  }) {
    this.WorkerPool = WorkerPool;
    this.providers = providers;
    this.monitor = monitor;
    this.providersFilter = providersFilter;
    this.estimator = estimator;
    this.iterate = new Iterate({
      maxFailures: 10,
      watchdogTime: 0,
      waitTime: 20000,
      maxIterationTime: 6000000,
      ...iterateConf,
      name: ownName,
      handler: async () => {
        await this.scan();
      },
      monitor,
    });
    this.iterate.on('error', () => {
      this.monitor.alert('iteration failed repeatedly; terminating process');
      process.exit(1);
    });
    this.db = db;
  }

  async initiate() {
    await this.iterate.start();
  }

  async terminate() {
    await this.iterate.stop();
  }

  async scan() {
    await this.providers.forAll(p => p.scanPrepare());

    this.monitor.info(`WorkerScanner providers filter: ${this.providersFilter.cond} ${this.providersFilter.value}`);

    // Phase 1: Check workers and collect termination candidates
    const poolCandidates = new Map();

    const fetch =
      async (size, offset) => await this.db.fns.get_non_stopped_workers_with_launch_config_scanner(
        null, null, null, this.providersFilter.cond, this.providersFilter.value, size, offset);
    for await (let row of paginatedIterator({ fetch, size: 500 })) {
      const worker = Worker.fromDb(row);
      const provider = this.providers.get(worker.providerId);
      if (provider) {
        if (provider.setupFailed) {
          // if setup has failed for this provider, just do nothing with the worker
          // until it's up and running
          continue;
        }
        try {
          await provider.checkWorker({ worker });
        } catch (err) {
          this.monitor.reportError(err); // Just report it and move on so this doesn't block other providers
        }
      } else {
        this.monitor.info(
          `Worker ${worker.workerGroup}/${worker.workerId} has unknown providerId ${worker.providerId} (ignoring)`);
      }

      // If the worker will be expired soon but it still exists,
      // update it to stick around a while longer. If this doesn't happen,
      // long-lived instances become orphaned from the provider. We don't update
      // this on every loop just to avoid the extra work when not needed
      if (worker.expires < taskcluster.fromNow('1 week')) {
        await worker.update(this.db, worker => {
          worker.expires = taskcluster.fromNow('8 days');
        });
      }

      // Collect termination candidates, skipping static provider workers
      if (provider && !provider.setupFailed && provider.providerType !== 'static') {
        const poolId = worker.workerPoolId;

        // Only RUNNING, non-quarantined workers are candidates for termination decisions
        const isQuarantined = worker.quarantineUntil && worker.quarantineUntil > new Date();
        if (worker.state === Worker.states.RUNNING && !isQuarantined) {
          if (!poolCandidates.has(poolId)) {
            poolCandidates.set(poolId, []);
          }
          poolCandidates.get(poolId).push(worker);
        }
      }
    }

    await this.providers.forAll(p => p.scanCleanup());

    // Phase 2: Compute termination decisions
    await this.#computeTerminationDecisions(poolCandidates);
  }

  async #computeTerminationDecisions(poolCandidates) {
    for (const [poolId, candidates] of poolCandidates) {
      try {
        const pool = await WorkerPool.get(this.db, poolId);
        if (!pool) {
          continue;
        }

        const allConfigs = await this.db.fns.get_worker_pool_launch_configs(poolId, null, null, null);
        const archivedConfigIds = new Set(
          allConfigs.filter(c => c.is_archived).map(c => c.launch_config_id),
        );

        const targetCapacity = await this.estimator.targetCapacity({
          workerPoolId: poolId,
          minCapacity: pool.config.minCapacity ?? 0,
          maxCapacity: pool.config.maxCapacity ?? 0,
          scalingRatio: pool.config.scalingRatio ?? 1.0,
        });

        // 1. Determine who lives and who dies
        const decisions = this.#evaluatePolicies(candidates, archivedConfigIds, targetCapacity);

        // Emit termination metrics by reason
        const terminationCounts = new Map();
        for (const [, decision] of decisions) {
          if (decision.terminate) {
            const reason = decision.reason === 'launch config archived' ? 'launch_config_archived' : 'over_capacity';
            terminationCounts.set(reason, (terminationCounts.get(reason) || 0) + 1);
          }
        }
        const poolLabels = { workerPoolId: poolId, providerId: pool.providerId };
        for (const [reason, count] of terminationCounts) {
          this.monitor.metric.workersToTerminate(count, { ...poolLabels, reason });
        }

        // 2. Persist changes
        const now = new Date().toISOString();
        for (const [worker, decision] of decisions) {
          const existing = worker.providerData?.shouldTerminate;

          if (existing?.terminate === decision.terminate && existing?.reason === decision.reason) {
            continue;
          }

          await worker.update(this.db, w => {
            w.providerData = {
              ...w.providerData,
              shouldTerminate: { ...decision, decidedAt: now },
            };
          });
        }
      } catch (err) {
        this.monitor.reportError(err, { poolId });
      }
    }
  }

  /**
    * Pure logic for determining worker lifecycle.
    * Sorting logic: We want to keep the NEWEST workers when over capacity.
    *
    * @param {Worker[]} candidates - List of workers to evaluate.
    * @param {Set<string>} archivedConfigIds - Set of archived config IDs.
    * @param {number} desiredCapacity - Desired capacity of the pool.
    * @returns {Map<Worker, { terminate: boolean, reason: string }>} Decisions for each worker.
    */
  #evaluatePolicies(candidates, archivedConfigIds, desiredCapacity) {
    const decisions = new Map();

    // Policy 1: Archived configs are non-negotiable terminations.
    // They don't even get to "compete" for the desiredCapacity.
    candidates.forEach(worker => {
      if (worker.launchConfigId && archivedConfigIds.has(worker.launchConfigId)) {
        decisions.set(worker, { terminate: true, reason: 'launch config archived' });
      }
    });

    // Policy 2: Capacity Management
    // We sort by 'created' DESC (newest first) to ensure we fill our capacity
    // with the most recent (and presumably most stable/configured) workers.
    const undecided = candidates
      .filter(w => !decisions.has(w))
      .sort((a, b) => b.created - a.created);

    let capacityToFill = desiredCapacity;

    for (const worker of undecided) {
      if (capacityToFill > 0) {
        decisions.set(worker, { terminate: false, reason: 'needed' });
        capacityToFill -= worker.capacity;
      } else {
        decisions.set(worker, { terminate: true, reason: 'over capacity' });
      }
    }

    return decisions;
  }
}
